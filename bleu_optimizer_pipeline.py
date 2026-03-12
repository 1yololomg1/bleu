"""
BLEU optimizer pipeline for Akkadian -> English translation.

Architecture overview
---------------------
Main class:
  - HybridAkkadianTranslator
      Responsibilities:
        1) Build translation memory from parallel training data.
        2) Build lexicon-informed token translation probabilities.
        3) Train an English bigram language model for fluency.
        4) Combine exact match, fuzzy retrieval, and token-level decoding.

Key functions:
  - find_data_dir():
      Detects competition data directory across common Kaggle paths.
  - corpus_bleu():
      Lightweight BLEU implementation for optional local validation.
  - main():
      End-to-end train -> infer -> submission workflow.

Data flow:
  train.csv + lexical resources -> model fit() ->
  hybrid inference on test.csv -> submission.csv

Design rationale:
  - BLEU improves quickly when exact/fuzzy sentence retrieval is prioritized
    on repetitive historical corpora.
  - A probabilistic monotonic decoder with a language model is used as a
    robust fallback when retrieval confidence is insufficient.
  - Lexicon priors stabilize low-frequency token behavior and reduce gaps.
"""

from __future__ import annotations

import argparse
import math
import os
import random
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


SEED = 42
random.seed(SEED)
np.random.seed(SEED)

SUBSCRIPT_MAP = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
DIACRITIC_MAP = str.maketrans(
    {
        "í": "i",
        "ú": "u",
        "á": "a",
        "é": "e",
        "ḫ": "h",
        "ḥ": "h",
        "Ḫ": "H",
        "„": "",
        "…": "",
    }
)


def find_data_dir() -> Path:
    """Find competition directory containing train/test CSVs."""
    candidates = [
        Path("/kaggle/input/deep-past-initiative-machine-translation"),
        Path("/kaggle/input/deep-past-challenge-translate-akk"),
        Path("/kaggle/input/competitions/deep-past-initiative-machine-translation"),
        Path("."),
    ]
    for p in candidates:
        if (p / "train.csv").exists() and (p / "test.csv").exists():
            return p
    if Path("/kaggle/input").exists():
        for root, _, files in os.walk("/kaggle/input"):
            if "train.csv" in files and "test.csv" in files:
                return Path(root)
    raise FileNotFoundError("Could not locate data directory containing train.csv and test.csv")


def _clean_english_training_text(text: str) -> str:
    """Normalize training translations to reduce annotation noise."""
    remove_tokens = ["fem.", "sing.", "pl.", "plural", "(?)", "<<", ">>", " xx "]
    out = f" {str(text)} "
    for tok in remove_tokens:
        out = out.replace(tok, " ")
    out = out.replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'")
    out = re.sub(r"\bPN\b", "<gap>", out)
    out = re.sub(r"\bx\b", "<gap>", out)
    out = re.sub(r"(?<=[A-Za-z])\.(?=\s|$)", "", out)
    out = re.sub(r":(?=\s|$)", "", out)
    out = re.sub(r"\s+", " ", out).strip()
    return out


def normalize_akk_token(token: str) -> str:
    """Normalize transliteration token for model indexing."""
    t = str(token).strip().translate(SUBSCRIPT_MAP).translate(DIACRITIC_MAP)
    t = unicodedata.normalize("NFKD", t)
    t = t.replace('"', "").replace("'", "")
    t = re.sub(r"\s+", "", t)
    return t.lower()


def normalize_akk_sentence(text: str) -> str:
    """Normalize full transliteration sentence using token-level normalization."""
    tokens = [normalize_akk_token(tok) for tok in str(text).split()]
    tokens = [t for t in tokens if t]
    return " ".join(tokens)


def tokenize_english(text: str) -> List[str]:
    """Tokenize English for LM/decoder scoring."""
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[./]\d+)?|<gap>", str(text).lower())


def _extract_meaning_from_definition(defn: str) -> Optional[str]:
    """Extract concise gloss from dictionary definition strings."""
    s = str(defn)
    quoted = re.search(r'"([^"]+)"', s)
    candidate = quoted.group(1).strip() if quoted else s
    candidate = candidate.split(";")[0].split(",")[0]
    candidate = re.sub(r"\([^)]+\)", "", candidate).strip()
    if candidate.startswith("to "):
        candidate = candidate[3:].strip()
    if len(candidate) < 2 or len(candidate.split()) > 4:
        return None
    return candidate


def corpus_bleu(
    references: Sequence[Sequence[str]],
    hypotheses: Sequence[Sequence[str]],
    max_order: int = 4,
    smooth: float = 1.0,
) -> float:
    """
    Compute corpus BLEU score (0..100).

    Side effect: none.
    """
    if len(references) != len(hypotheses):
        raise ValueError("references and hypotheses must have same length")
    if not references:
        return 0.0

    matches_by_order = [0] * max_order
    possible_by_order = [0] * max_order
    ref_len = 0
    hyp_len = 0

    for ref, hyp in zip(references, hypotheses):
        ref_len += len(ref)
        hyp_len += len(hyp)
        for n in range(1, max_order + 1):
            ref_ngrams = Counter(tuple(ref[i : i + n]) for i in range(max(0, len(ref) - n + 1)))
            hyp_ngrams = Counter(tuple(hyp[i : i + n]) for i in range(max(0, len(hyp) - n + 1)))
            overlap = hyp_ngrams & ref_ngrams
            matches_by_order[n - 1] += sum(overlap.values())
            possible_by_order[n - 1] += max(0, len(hyp) - n + 1)

    precisions = []
    for i in range(max_order):
        if possible_by_order[i] == 0:
            precisions.append(0.0)
        else:
            precisions.append((matches_by_order[i] + smooth) / (possible_by_order[i] + smooth))

    if min(precisions) <= 0:
        return 0.0
    geo_mean = math.exp(sum((1.0 / max_order) * math.log(p) for p in precisions))
    bp = 1.0 if hyp_len > ref_len else math.exp(1.0 - (ref_len / max(1, hyp_len)))
    return 100.0 * bp * geo_mean


@dataclass
class DecoderConfig:
    beam_width: int = 16
    max_candidates_per_token: int = 8
    lm_weight: float = 0.9
    gap_penalty: float = 2.2
    length_bonus: float = 0.03
    exact_retrieval_similarity: float = 0.995
    fuzzy_retrieval_similarity: float = 0.90
    soft_retrieval_similarity: float = 0.82
    retrieval_lm_margin: float = 1.0


class HybridAkkadianTranslator:
    """
    Hybrid decoder combining sentence retrieval and lexicon-guided token decoding.

    Public methods:
      - fit(train_df, translit_col, trans_col)
      - translate(transliteration)
      - translate_batch(transliterations)
    """

    def __init__(self, config: Optional[DecoderConfig] = None):
        self.config = config or DecoderConfig()
        self.stopwords = {
            "the",
            "a",
            "an",
            "and",
            "or",
            "of",
            "to",
            "in",
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "it",
            "its",
            "that",
            "this",
            "for",
            "on",
            "at",
            "by",
            "with",
            "from",
            "as",
            "not",
        }

        # Core lexical priors preserve the lexicon-centric strategy.
        self.hard_map: Dict[str, str] = {
            "a-na": "to",
            "ana": "to",
            "i-na": "in",
            "ina": "in",
            "sa": "of",
            "ša": "of",
            "u": "and",
            "ú": "and",
            "la": "not",
            "lá": "not",
            "lu": "let",
            "ki-ma": "just as",
            "um-ma": "thus says",
        }
        self.logogram_map: Dict[str, str] = {
            "ku.babbar": "silver",
            "ku.an": "tin",
            "an.na": "tin",
            "e.gal": "palace",
            "dam.gar": "merchant",
        }

        self.lexicon_map: Dict[str, str] = {}
        self.onomasticon: Dict[str, str] = {}

        self.translation_memory: Dict[str, str] = {}
        self.train_norm_translits: List[str] = []
        self.train_translations: List[str] = []

        self.retrieval_vectorizer: Optional[TfidfVectorizer] = None
        self.retrieval_matrix = None

        self.token_to_eng: Dict[str, Counter] = defaultdict(Counter)
        self.root_to_eng: Dict[str, Counter] = defaultdict(Counter)
        self.unigram = Counter()
        self.bigram = Counter()
        self.vocab: set[str] = set()

    def _token_root(self, token: str) -> str:
        """Light root heuristic for sparse token generalization."""
        t = normalize_akk_token(token)
        t = re.sub(r"^(a-|i-|u-|ta-|lu-|ni-)", "", t)
        t = re.sub(r"(-ma|-um|-im|-am|-su|-sa|-ka|-ki|-ni)$", "", t)
        return t if len(t.replace("-", "")) >= 3 else normalize_akk_token(token)

    def _load_lexical_resources(self) -> None:
        """Load available lexicons and merge into lexical prior map."""
        ebl_candidates = [
            Path("/kaggle/input/deep-past-initiative-machine-translation/eBL_Dictionary.csv"),
            Path("/kaggle/input/deep-past-challenge-translate-akk/eBL_Dictionary.csv"),
            Path("eBL_Dictionary.csv"),
        ]
        for p in ebl_candidates:
            if p.exists():
                ebl_df = pd.read_csv(p)
                for _, row in ebl_df.iterrows():
                    headword = normalize_akk_token(row.get("word", ""))
                    meaning = _extract_meaning_from_definition(row.get("definition", ""))
                    if headword and meaning and headword not in self.lexicon_map:
                        self.lexicon_map[headword] = meaning.lower()
                break

        cad_paths = [
            Path("/kaggle/input/datasets/alvarochaveste/akkylexyfromdic/akkadian_lexiconfromdick.csv"),
            Path("/kaggle/input/datasets/alvarochaveste/akkylexyfromdic/akkadian_lexiconfromdick1-74.csv"),
            Path("/kaggle/input/datasets/alvarochaveste/akkadian-lexicon-clean/akkadian_lexicon_clean.csv"),
        ]
        for p in cad_paths:
            if not p.exists():
                continue
            df = pd.read_csv(p)
            if "headword" in df.columns:
                gloss_col = "gloss" if "gloss" in df.columns else "definition"
                for _, row in df.iterrows():
                    headword = normalize_akk_token(row.get("headword", ""))
                    gloss = _extract_meaning_from_definition(row.get(gloss_col, ""))
                    if headword and gloss and headword not in self.lexicon_map:
                        self.lexicon_map[headword] = gloss.lower()

        ono_path = Path("/kaggle/input/datasets/deeppast/old-assyrian-grammars-and-other-resources/onomasticon.csv")
        if ono_path.exists():
            ono_df = pd.read_csv(ono_path)
            if "Name" in ono_df.columns:
                for _, row in ono_df.iterrows():
                    canonical = str(row.get("Name", "")).strip()
                    if canonical and canonical != "nan":
                        key = normalize_akk_token(canonical)
                        self.onomasticon[key] = canonical
                        spellings = str(row.get("Spellings_semicolon_separated", ""))
                        for sp in spellings.split(";"):
                            spk = normalize_akk_token(sp)
                            if spk:
                                self.onomasticon[spk] = canonical

    def _build_translation_memory(self, translits: Sequence[str], translations: Sequence[str]) -> None:
        """Build exact normalized transliteration -> most frequent translation map."""
        bucket: Dict[str, Counter] = defaultdict(Counter)
        for src, tgt in zip(translits, translations):
            bucket[src][tgt] += 1
        self.translation_memory = {src: cnt.most_common(1)[0][0] for src, cnt in bucket.items()}

    def _fit_retriever(self, translits: Sequence[str]) -> None:
        """Train character TF-IDF retrieval model for fuzzy sentence matching."""
        self.retrieval_vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 6), min_df=1)
        self.retrieval_matrix = self.retrieval_vectorizer.fit_transform(translits)

    def _build_translation_tables(self, translits: Sequence[str], translations: Sequence[str]) -> None:
        """
        Build token->english and root->english probability tables.

        Why this works:
          Relative position weighting reduces cross-sentence bag-of-words noise
          compared to naive co-occurrence.
        """
        for src, tgt in zip(translits, translations):
            f_tokens = [t for t in src.split() if t]
            e_tokens = tokenize_english(tgt)
            if not f_tokens or not e_tokens:
                continue
            m, n = len(f_tokens), len(e_tokens)
            for i, f_tok in enumerate(f_tokens):
                center_f = (i + 0.5) / m
                f_root = self._token_root(f_tok)
                for j, e_tok in enumerate(e_tokens):
                    center_e = (j + 0.5) / n
                    dist = abs(center_f - center_e)
                    w = math.exp(-4.0 * dist)
                    self.token_to_eng[f_tok][e_tok] += w
                    self.root_to_eng[f_root][e_tok] += 0.6 * w

        # Lexicon prior anchors low-frequency tokens.
        for tok, gloss in self.lexicon_map.items():
            for w in tokenize_english(gloss):
                self.token_to_eng[tok][w] += 5.0
                self.root_to_eng[self._token_root(tok)][w] += 2.0
        for tok, gloss in self.hard_map.items():
            for w in tokenize_english(gloss):
                nt = normalize_akk_token(tok)
                self.token_to_eng[nt][w] += 8.0

    def _build_language_model(self, translations: Sequence[str]) -> None:
        """Build smoothed bigram LM from training translations."""
        for tgt in translations:
            words = tokenize_english(tgt)
            if not words:
                continue
            seq = ["<s>"] + words + ["</s>"]
            for w in seq[1:]:
                self.unigram[w] += 1
                self.vocab.add(w)
            self.unigram["<s>"] += 1
            for i in range(len(seq) - 1):
                self.bigram[(seq[i], seq[i + 1])] += 1
        self.vocab.update({"<s>", "</s>"})

    def fit(self, train_df: pd.DataFrame, translit_col: str, trans_col: str) -> None:
        """
        Fit hybrid model from training DataFrame.

        Side effects:
          - populates retrieval index, translation memory, translation tables, and LM.
        """
        self._load_lexical_resources()

        translits = [normalize_akk_sentence(x) for x in train_df[translit_col].fillna("")]
        translations = [_clean_english_training_text(x) for x in train_df[trans_col].fillna("")]

        self.train_norm_translits = translits
        self.train_translations = translations

        self._build_translation_memory(translits, translations)
        self._fit_retriever(translits)
        self._build_translation_tables(translits, translations)
        self._build_language_model(translations)

    def _bigram_log_prob(self, prev_word: str, word: str, alpha: float = 0.4) -> float:
        """Smoothed bigram log-probability for LM scoring."""
        v = max(1, len(self.vocab))
        num = self.bigram[(prev_word, word)] + alpha
        den = self.unigram[prev_word] + alpha * v
        return math.log(num / den)

    def _lm_sentence_score(self, words: Sequence[str]) -> float:
        """Total LM score including EOS transition."""
        prev = "<s>"
        score = 0.0
        for w in words:
            score += self._bigram_log_prob(prev, w)
            prev = w
        score += self._bigram_log_prob(prev, "</s>")
        return score

    def _fuzzy_retrieve(self, norm_translit: str) -> Tuple[Optional[str], float]:
        """Return nearest training translation and cosine similarity."""
        if not self.retrieval_vectorizer or self.retrieval_matrix is None:
            return None, 0.0
        qv = self.retrieval_vectorizer.transform([norm_translit])
        sims = cosine_similarity(qv, self.retrieval_matrix)[0]
        if sims.size == 0:
            return None, 0.0
        idx = int(np.argmax(sims))
        return self.train_translations[idx], float(sims[idx])

    def _candidate_phrases(self, raw_token: str) -> List[Tuple[str, float]]:
        """Generate token-level translation candidates with calibrated priors."""
        token = normalize_akk_token(raw_token)
        cands: Dict[str, float] = {}

        if token in self.hard_map:
            cands[self.hard_map[token].lower()] = max(cands.get(self.hard_map[token].lower(), 0.0), 0.99)
        if token in self.logogram_map:
            cands[self.logogram_map[token].lower()] = max(cands.get(self.logogram_map[token].lower(), 0.0), 0.97)
        if token in self.lexicon_map:
            cands[self.lexicon_map[token].lower()] = max(cands.get(self.lexicon_map[token].lower(), 0.0), 0.94)
        if token in self.onomasticon:
            cands[self.onomasticon[token].lower()] = max(cands.get(self.onomasticon[token].lower(), 0.0), 0.95)

        # Learned token-level evidence.
        if token in self.token_to_eng:
            total = sum(self.token_to_eng[token].values()) or 1.0
            for w, cnt in self.token_to_eng[token].most_common(self.config.max_candidates_per_token):
                if len(w) <= 1 and w not in {"a", "i"}:
                    continue
                prob = 0.15 + 0.75 * (cnt / total)
                cands[w] = max(cands.get(w, 0.0), prob)

        # Backoff to root-level evidence.
        root = self._token_root(token)
        if root in self.root_to_eng:
            total = sum(self.root_to_eng[root].values()) or 1.0
            for w, cnt in self.root_to_eng[root].most_common(max(3, self.config.max_candidates_per_token // 2)):
                prob = 0.1 + 0.55 * (cnt / total)
                cands[w] = max(cands.get(w, 0.0), prob)

        # Numeric and suffix-aware fallbacks.
        if re.fullmatch(r"\d+(?:[./]\d+)?", token):
            cands[token] = max(cands.get(token, 0.0), 0.92)
        if token.endswith("-ma"):
            base = token[:-3]
            if base in self.lexicon_map:
                cands["and " + self.lexicon_map[base].lower()] = max(
                    cands.get("and " + self.lexicon_map[base].lower(), 0.0), 0.90
                )
            cands["and"] = max(cands.get("and", 0.0), 0.85)

        if not cands:
            # Prefer preserving probable names over unconditional <gap>.
            if re.search(r"[A-Z]", raw_token) or raw_token.count("-") >= 1:
                preserved = re.sub(r"\s+", "-", raw_token.strip()).lower()
                cands[preserved] = 0.25
            cands["<gap>"] = 0.2

        # Keep highest-prob candidates.
        items = sorted(cands.items(), key=lambda kv: kv[1], reverse=True)
        return items[: self.config.max_candidates_per_token]

    def _decode_tokens(self, raw_tokens: Sequence[str]) -> str:
        """Monotonic beam decoder using lexical priors + LM fluency."""
        beams: List[Tuple[float, List[str]]] = [(0.0, [])]

        for raw_tok in raw_tokens:
            token_cands = self._candidate_phrases(raw_tok)
            next_beams: List[Tuple[float, List[str]]] = []
            for score, seq in beams:
                prev = seq[-1] if seq else "<s>"
                for phrase, p in token_cands:
                    words = tokenize_english(phrase)
                    if not words:
                        continue
                    new_score = score + math.log(max(p, 1e-8))
                    local_prev = prev
                    for w in words:
                        new_score += self.config.lm_weight * self._bigram_log_prob(local_prev, w)
                        local_prev = w
                    new_score += self.config.length_bonus * len(words)
                    if "<gap>" in words:
                        new_score -= self.config.gap_penalty
                    next_beams.append((new_score, seq + words))
            if not next_beams:
                continue
            next_beams.sort(key=lambda x: x[0], reverse=True)
            beams = next_beams[: self.config.beam_width]

        if not beams:
            return "<gap>."
        best_seq = max(beams, key=lambda x: x[0])[1]
        best_seq = self._postprocess(best_seq)
        if not best_seq:
            return "<gap>."
        sent = " ".join(best_seq)
        return sent[0].upper() + sent[1:] + "."

    def _postprocess(self, words: List[str]) -> List[str]:
        """Remove repetitive artifacts and malformed tokens."""
        cleaned: List[str] = []
        for w in words:
            w = w.strip().lower()
            if not w:
                continue
            if cleaned and cleaned[-1] == w:
                continue
            cleaned.append(w)

        # Remove repeated short n-grams.
        out = cleaned
        for n in (4, 3, 2):
            i = 0
            compact: List[str] = []
            while i < len(out):
                if i + 2 * n <= len(out) and out[i : i + n] == out[i + n : i + 2 * n]:
                    compact.extend(out[i : i + n])
                    i += 2 * n
                else:
                    compact.append(out[i])
                    i += 1
            out = compact
        return out

    def translate(self, transliteration: str) -> str:
        """Translate one transliteration string with hybrid strategy."""
        norm = normalize_akk_sentence(transliteration)
        raw_tokens = str(transliteration).split()
        if not norm:
            return "<gap>."

        # 1) Exact memory has highest precision and should dominate when available.
        if norm in self.translation_memory:
            hit = self.translation_memory[norm].strip()
            if hit:
                if hit.endswith("."):
                    return hit[0].upper() + hit[1:]
                return hit[0].upper() + hit[1:] + "."

        # 2) Fuzzy retrieval handles minor orthographic variants.
        retrieved, sim = self._fuzzy_retrieve(norm)
        if retrieved and sim >= self.config.fuzzy_retrieval_similarity:
            hit = retrieved.strip()
            if hit.endswith("."):
                return hit[0].upper() + hit[1:]
            return hit[0].upper() + hit[1:] + "."

        # 3) Decoder fallback for novel strings.
        decoded = self._decode_tokens(raw_tokens)

        # 4) Soft retrieval rerank: allow high-sim memory to win when LM supports it.
        if retrieved and sim >= self.config.soft_retrieval_similarity:
            retrieved_words = tokenize_english(retrieved)
            decoded_words = tokenize_english(decoded)
            r_score = self._lm_sentence_score(retrieved_words)
            d_score = self._lm_sentence_score(decoded_words)
            if r_score >= d_score - self.config.retrieval_lm_margin:
                hit = retrieved.strip()
                if hit.endswith("."):
                    return hit[0].upper() + hit[1:]
                return hit[0].upper() + hit[1:] + "."

        return decoded

    def translate_batch(self, transliterations: Iterable[str]) -> List[str]:
        """Translate many sentences; deterministic order-preserving output."""
        return [self.translate(t) for t in transliterations]


def infer_columns(train_df: pd.DataFrame, test_df: pd.DataFrame) -> Tuple[str, str, str]:
    """Infer transliteration/translation/id columns safely."""
    translit_col = "transliteration" if "transliteration" in train_df.columns else train_df.columns[1]
    trans_col = "translation" if "translation" in train_df.columns else train_df.columns[2]
    test_id_col = "id" if "id" in test_df.columns else test_df.columns[0]
    return translit_col, trans_col, test_id_col


def run_self_eval(
    train_df: pd.DataFrame,
    translit_col: str,
    trans_col: str,
    eval_fraction: float = 0.12,
) -> float:
    """Run holdout BLEU evaluation for quick local tuning feedback."""
    if len(train_df) < 50:
        return 0.0
    idx = np.arange(len(train_df))
    rng = np.random.default_rng(SEED)
    rng.shuffle(idx)
    split = max(1, int(len(idx) * (1.0 - eval_fraction)))
    fit_idx = idx[:split]
    val_idx = idx[split:]

    fit_df = train_df.iloc[fit_idx].reset_index(drop=True)
    val_df = train_df.iloc[val_idx].reset_index(drop=True)

    model = HybridAkkadianTranslator()
    model.fit(fit_df, translit_col=translit_col, trans_col=trans_col)
    hyps = model.translate_batch(val_df[translit_col].fillna("").tolist())

    refs_tok = [tokenize_english(_clean_english_training_text(x)) for x in val_df[trans_col].fillna("")]
    hyps_tok = [tokenize_english(x) for x in hyps]
    return corpus_bleu(refs_tok, hyps_tok)


def main() -> None:
    parser = argparse.ArgumentParser(description="Hybrid BLEU-optimized Akkadian translation pipeline")
    parser.add_argument("--self-eval", action="store_true", help="Run holdout BLEU estimate before full inference")
    parser.add_argument("--eval-fraction", type=float, default=0.12, help="Holdout fraction for --self-eval")
    parser.add_argument("--output", type=str, default="submission.csv", help="Submission CSV output path")
    args = parser.parse_args()

    data_dir = find_data_dir()
    train_df = pd.read_csv(data_dir / "train.csv")
    test_df = pd.read_csv(data_dir / "test.csv")
    translit_col, trans_col, test_id_col = infer_columns(train_df, test_df)

    # Normalize noisy training target strings before fitting.
    train_df = train_df.copy()
    train_df[trans_col] = train_df[trans_col].fillna("").map(_clean_english_training_text)
    train_df[translit_col] = train_df[translit_col].fillna("").map(str)

    if args.self_eval:
        est_bleu = run_self_eval(
            train_df=train_df,
            translit_col=translit_col,
            trans_col=trans_col,
            eval_fraction=args.eval_fraction,
        )
        print(f"[SELF-EVAL] Estimated holdout BLEU: {est_bleu:.2f}")

    model = HybridAkkadianTranslator()
    model.fit(train_df, translit_col=translit_col, trans_col=trans_col)
    predictions = model.translate_batch(test_df[translit_col].fillna("").tolist())

    submission = pd.DataFrame({"id": test_df[test_id_col], "translation": predictions})
    submission.to_csv(args.output, index=False)
    print(f"[DONE] Wrote {len(submission)} rows -> {args.output}")


if __name__ == "__main__":
    main()
