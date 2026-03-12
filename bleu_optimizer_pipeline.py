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
    verbose: int = 0
    trace_top_k: int = 5


def sentence_bleu(reference_tokens: Sequence[str], hypothesis_tokens: Sequence[str]) -> float:
    """Compute sentence-level BLEU (0..100) with smoothing."""
    return corpus_bleu([reference_tokens], [hypothesis_tokens], max_order=4, smooth=1.0)


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
        self.route_counter = Counter()
        self.unknown_token_counter = Counter()
        self.retrieval_sim_sum = 0.0
        self.retrieval_sim_count = 0

    def _vprint(self, level: int, msg: str) -> None:
        """Conditional logger controlled by config.verbose."""
        if self.config.verbose >= level:
            print(msg)

    def _finalize_sentence(self, text: str) -> str:
        """Normalize output sentence casing and punctuation."""
        s = str(text).strip()
        if not s:
            return "<gap>."
        if not s.endswith("."):
            s += "."
        return s[0].upper() + s[1:] if s else s

    def _token_root(self, token: str) -> str:
        """Light root heuristic for sparse token generalization."""
        t = normalize_akk_token(token)
        t = re.sub(r"^(a-|i-|u-|ta-|lu-|ni-)", "", t)
        t = re.sub(r"(-ma|-um|-im|-am|-su|-sa|-ka|-ki|-ni)$", "", t)
        return t if len(t.replace("-", "")) >= 3 else normalize_akk_token(token)

    def _load_lexical_resources(self) -> None:
        """Load available lexicons and merge into lexical prior map."""
        ebl_loaded = 0
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
                        ebl_loaded += 1
                break

        cad_paths = [
            Path("/kaggle/input/datasets/alvarochaveste/akkylexyfromdic/akkadian_lexiconfromdick.csv"),
            Path("/kaggle/input/datasets/alvarochaveste/akkylexyfromdic/akkadian_lexiconfromdick1-74.csv"),
            Path("/kaggle/input/datasets/alvarochaveste/akkadian-lexicon-clean/akkadian_lexicon_clean.csv"),
        ]
        cad_loaded = 0
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
                        cad_loaded += 1

        ono_path = Path("/kaggle/input/datasets/deeppast/old-assyrian-grammars-and-other-resources/onomasticon.csv")
        ono_loaded = 0
        if ono_path.exists():
            ono_df = pd.read_csv(ono_path)
            if "Name" in ono_df.columns:
                for _, row in ono_df.iterrows():
                    canonical = str(row.get("Name", "")).strip()
                    if canonical and canonical != "nan":
                        key = normalize_akk_token(canonical)
                        self.onomasticon[key] = canonical
                        ono_loaded += 1
                        spellings = str(row.get("Spellings_semicolon_separated", ""))
                        for sp in spellings.split(";"):
                            spk = normalize_akk_token(sp)
                            if spk:
                                self.onomasticon[spk] = canonical
                                ono_loaded += 1
        self._vprint(
            1,
            (
                f"[FIT] lexical resources: "
                f"ebl_added={ebl_loaded}, cad_added={cad_loaded}, "
                f"lexicon_total={len(self.lexicon_map)}, onomasticon_keys={len(self.onomasticon)}"
            ),
        )

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
        self._vprint(
            1,
            (
                f"[FIT] memory={len(self.translation_memory)} | "
                f"token_table={len(self.token_to_eng)} | root_table={len(self.root_to_eng)} | "
                f"vocab={len(self.vocab)}"
            ),
        )

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

    def _candidate_phrases_with_meta(self, raw_token: str) -> Tuple[List[Tuple[str, float]], Dict[str, object]]:
        """Generate token-level candidates and provenance metadata for debugging."""
        token = normalize_akk_token(raw_token)
        cands: Dict[str, float] = {}
        sources: List[str] = []

        if token in self.hard_map:
            cands[self.hard_map[token].lower()] = max(cands.get(self.hard_map[token].lower(), 0.0), 0.99)
            sources.append("hard_map")
        if token in self.logogram_map:
            cands[self.logogram_map[token].lower()] = max(cands.get(self.logogram_map[token].lower(), 0.0), 0.97)
            sources.append("logogram")
        if token in self.lexicon_map:
            cands[self.lexicon_map[token].lower()] = max(cands.get(self.lexicon_map[token].lower(), 0.0), 0.94)
            sources.append("lexicon")
        if token in self.onomasticon:
            cands[self.onomasticon[token].lower()] = max(cands.get(self.onomasticon[token].lower(), 0.0), 0.95)
            sources.append("onomasticon")

        # Learned token-level evidence.
        if token in self.token_to_eng:
            sources.append("token_table")
            total = sum(self.token_to_eng[token].values()) or 1.0
            for w, cnt in self.token_to_eng[token].most_common(self.config.max_candidates_per_token):
                if len(w) <= 1 and w not in {"a", "i"}:
                    continue
                prob = 0.15 + 0.75 * (cnt / total)
                cands[w] = max(cands.get(w, 0.0), prob)

        # Backoff to root-level evidence.
        root = self._token_root(token)
        if root in self.root_to_eng:
            sources.append("root_table")
            total = sum(self.root_to_eng[root].values()) or 1.0
            for w, cnt in self.root_to_eng[root].most_common(max(3, self.config.max_candidates_per_token // 2)):
                prob = 0.1 + 0.55 * (cnt / total)
                cands[w] = max(cands.get(w, 0.0), prob)

        # Numeric and suffix-aware fallbacks.
        if re.fullmatch(r"\d+(?:[./]\d+)?", token):
            cands[token] = max(cands.get(token, 0.0), 0.92)
            sources.append("numeric")
        if token.endswith("-ma"):
            base = token[:-3]
            if base in self.lexicon_map:
                cands["and " + self.lexicon_map[base].lower()] = max(
                    cands.get("and " + self.lexicon_map[base].lower(), 0.0), 0.90
                )
            cands["and"] = max(cands.get("and", 0.0), 0.85)
            sources.append("suffix_ma")

        used_fallback = False
        if not cands:
            used_fallback = True
            self.unknown_token_counter[token] += 1
            # Prefer preserving probable names over unconditional <gap>.
            if re.search(r"[A-Z]", raw_token) or raw_token.count("-") >= 1:
                preserved = re.sub(r"\s+", "-", raw_token.strip()).lower()
                cands[preserved] = 0.25
            cands["<gap>"] = 0.2
            sources.append("fallback")

        items = sorted(cands.items(), key=lambda kv: kv[1], reverse=True)[: self.config.max_candidates_per_token]
        meta = {
            "raw_token": raw_token,
            "norm_token": token,
            "root": root,
            "sources": sorted(set(sources)),
            "used_fallback": used_fallback,
            "top_candidates": items[: self.config.trace_top_k],
        }
        return items, meta

    def _decode_tokens(self, raw_tokens: Sequence[str], return_trace: bool = False):
        """Monotonic beam decoder using lexical priors + LM fluency."""
        beams: List[Tuple[float, List[str]]] = [(0.0, [])]
        trace: Dict[str, object] = {"token_debug": [], "beam_width": self.config.beam_width}

        for raw_tok in raw_tokens:
            token_cands, token_meta = self._candidate_phrases_with_meta(raw_tok)
            if return_trace:
                trace["token_debug"].append(token_meta)
            if self.config.verbose >= 3:
                self._vprint(3, f"[TOKEN] {token_meta}")

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
            out = "<gap>."
            if return_trace:
                trace["decoded_sequence"] = ["<gap>"]
                return out, trace
            return out

        best_seq = max(beams, key=lambda x: x[0])[1]
        best_seq = self._postprocess(best_seq)
        if not best_seq:
            out = "<gap>."
            if return_trace:
                trace["decoded_sequence"] = ["<gap>"]
                return out, trace
            return out

        trace["decoded_sequence"] = list(best_seq)
        sent = self._finalize_sentence(" ".join(best_seq))
        if return_trace:
            return sent, trace
        return sent

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

    def translate_with_trace(self, transliteration: str) -> Tuple[str, Dict[str, object]]:
        """Translate one transliteration string and return a full decision trace."""
        norm = normalize_akk_sentence(transliteration)
        raw_tokens = str(transliteration).split()
        trace: Dict[str, object] = {
            "input": transliteration,
            "normalized_input": norm,
            "token_count": len(raw_tokens),
            "route": None,
            "retrieval_similarity": None,
            "retrieved_translation": None,
            "decoded_trace": None,
        }
        if not norm:
            trace["route"] = "empty"
            self.route_counter["empty"] += 1
            return "<gap>.", trace

        # 1) Exact memory has highest precision and should dominate when available.
        if norm in self.translation_memory:
            hit = self.translation_memory[norm].strip()
            if hit:
                trace["route"] = "exact_memory"
                self.route_counter["exact_memory"] += 1
                return self._finalize_sentence(hit), trace

        # 2) Fuzzy retrieval handles minor orthographic variants.
        retrieved, sim = self._fuzzy_retrieve(norm)
        trace["retrieval_similarity"] = float(sim)
        trace["retrieved_translation"] = retrieved
        self.retrieval_sim_sum += float(sim)
        self.retrieval_sim_count += 1
        if retrieved and sim >= self.config.fuzzy_retrieval_similarity:
            trace["route"] = "fuzzy_retrieval"
            self.route_counter["fuzzy_retrieval"] += 1
            return self._finalize_sentence(retrieved), trace

        # 3) Decoder fallback for novel strings.
        decoded, decoded_trace = self._decode_tokens(raw_tokens, return_trace=True)
        trace["decoded_trace"] = decoded_trace

        # 4) Soft retrieval rerank: allow high-sim memory to win when LM supports it.
        if retrieved and sim >= self.config.soft_retrieval_similarity:
            retrieved_words = tokenize_english(retrieved)
            decoded_words = tokenize_english(decoded)
            r_score = self._lm_sentence_score(retrieved_words)
            d_score = self._lm_sentence_score(decoded_words)
            if r_score >= d_score - self.config.retrieval_lm_margin:
                trace["route"] = "soft_retrieval_rerank"
                trace["lm_scores"] = {"retrieved": r_score, "decoded": d_score}
                self.route_counter["soft_retrieval_rerank"] += 1
                return self._finalize_sentence(retrieved), trace

        trace["route"] = "decoder"
        self.route_counter["decoder"] += 1
        return decoded, trace

    def translate(self, transliteration: str) -> str:
        """Translate one transliteration string with hybrid strategy."""
        output, trace = self.translate_with_trace(transliteration)
        if self.config.verbose >= 2:
            sim_val = trace.get("retrieval_similarity")
            sim_s = f"{sim_val:.3f}" if isinstance(sim_val, float) else "n/a"
            self._vprint(
                2,
                (
                    f"[TRACE] route={trace.get('route')} "
                    f"sim={sim_s} tokens={trace.get('token_count')} "
                    f"output={output}"
                ),
            )
        return output

    def translate_batch(self, transliterations: Iterable[str]) -> List[str]:
        """Translate many sentences; deterministic order-preserving output."""
        outputs: List[str] = []
        for i, t in enumerate(transliterations):
            out, trace = self.translate_with_trace(t)
            outputs.append(out)
            if self.config.verbose >= 1:
                sim_val = trace.get("retrieval_similarity")
                sim_s = f"{sim_val:.3f}" if isinstance(sim_val, float) else "n/a"
                self._vprint(1, f"[PRED {i:04d}] route={trace.get('route'):<20} sim={sim_s} -> {out}")
        return outputs

    def print_debug_summary(self, top_unknown: int = 15) -> None:
        """Print aggregate inference diagnostics."""
        total = sum(self.route_counter.values())
        print("[DEBUG] Inference route distribution:")
        if total == 0:
            print("  (no sentences translated)")
            return
        for route, count in self.route_counter.most_common():
            print(f"  - {route:<22} {count:5d} ({(100.0 * count / total):5.1f}%)")
        if self.retrieval_sim_count:
            avg_sim = self.retrieval_sim_sum / self.retrieval_sim_count
            print(f"[DEBUG] Avg top-1 retrieval similarity: {avg_sim:.3f}")
        if self.unknown_token_counter:
            print(f"[DEBUG] Top unknown tokens (fallback path):")
            for tok, c in self.unknown_token_counter.most_common(top_unknown):
                print(f"  - {tok:<20} {c}")


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
    verbose: int = 0,
    verbose_samples: int = 8,
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

    model = HybridAkkadianTranslator(config=DecoderConfig(verbose=max(0, verbose - 1)))
    model.fit(fit_df, translit_col=translit_col, trans_col=trans_col)
    val_src = val_df[translit_col].fillna("").tolist()
    val_ref_clean = [_clean_english_training_text(x) for x in val_df[trans_col].fillna("")]
    hyps: List[str] = []
    traces: List[Dict[str, object]] = []
    for src in val_src:
        hyp, tr = model.translate_with_trace(src)
        hyps.append(hyp)
        traces.append(tr)

    refs_tok = [tokenize_english(x) for x in val_ref_clean]
    hyps_tok = [tokenize_english(x) for x in hyps]
    bleu = corpus_bleu(refs_tok, hyps_tok)

    if verbose >= 1:
        route_counter = Counter(str(t.get("route", "unknown")) for t in traces)
        avg_sim = np.mean([float(t.get("retrieval_similarity", 0.0) or 0.0) for t in traces]) if traces else 0.0
        gap_rate = 0.0
        total_words = 0
        gap_words = 0
        for hyp_tokens in hyps_tok:
            total_words += len(hyp_tokens)
            gap_words += sum(1 for w in hyp_tokens if w == "<gap>")
        if total_words > 0:
            gap_rate = 100.0 * gap_words / total_words

        print("[SELF-EVAL][DEBUG] route distribution:")
        for route, count in route_counter.most_common():
            print(f"  - {route:<22} {count:5d}")
        print(f"[SELF-EVAL][DEBUG] avg retrieval similarity: {avg_sim:.3f}")
        print(f"[SELF-EVAL][DEBUG] gap token rate: {gap_rate:.2f}%")
        if model.unknown_token_counter:
            print("[SELF-EVAL][DEBUG] top unknown tokens:")
            for tok, cnt in model.unknown_token_counter.most_common(15):
                print(f"  - {tok:<20} {cnt}")

    if verbose >= 2 and traces:
        # Show lowest sentence-BLEU examples for fast error diagnosis.
        example_rows = []
        for i, (src, ref, hyp, tr) in enumerate(zip(val_src, val_ref_clean, hyps, traces)):
            s_bleu = sentence_bleu(tokenize_english(ref), tokenize_english(hyp))
            example_rows.append((s_bleu, i, src, ref, hyp, tr))
        example_rows.sort(key=lambda x: x[0])
        print(f"[SELF-EVAL][DEBUG] worst {min(verbose_samples, len(example_rows))} examples:")
        for s_bleu, i, src, ref, hyp, tr in example_rows[:verbose_samples]:
            sim = tr.get("retrieval_similarity")
            sim_s = f"{float(sim):.3f}" if isinstance(sim, (int, float)) else "n/a"
            print("-" * 80)
            print(f"[#{i}] sentence_BLEU={s_bleu:.2f} route={tr.get('route')} sim={sim_s}")
            print(f"SRC: {src}")
            print(f"REF: {ref}")
            print(f"HYP: {hyp}")
            if tr.get("decoded_trace"):
                token_debug = tr["decoded_trace"].get("token_debug", [])
                for td in token_debug[: min(6, len(token_debug))]:
                    print(
                        f"  TOK {td.get('raw_token')} | sources={td.get('sources')} | "
                        f"fallback={td.get('used_fallback')} | top={td.get('top_candidates')}"
                    )

    return bleu


def parse_args_notebook_safe(parser: argparse.ArgumentParser) -> argparse.Namespace:
    """
    Parse CLI arguments safely in both terminal and Jupyter/IPython.

    Why:
      Notebook kernels inject extra argv entries (for example '-f ...json')
      that make argparse exit before the pipeline runs. Using parse_known_args
      keeps intended flags while ignoring kernel internals.
    """
    args, unknown = parser.parse_known_args()
    if unknown:
        print(f"[ARGS] Ignoring unknown args: {unknown}")
    return args


def main() -> None:
    parser = argparse.ArgumentParser(description="Hybrid BLEU-optimized Akkadian translation pipeline")
    parser.add_argument("--self-eval", action="store_true", help="Run holdout BLEU estimate before full inference")
    parser.add_argument("--eval-fraction", type=float, default=0.12, help="Holdout fraction for --self-eval")
    parser.add_argument("--output", type=str, default="submission.csv", help="Submission CSV output path")
    parser.add_argument(
        "--verbose",
        type=int,
        default=1,
        help="Verbosity level: 0=minimal, 1=summary, 2=trace, 3=token-detail",
    )
    parser.add_argument(
        "--verbose-samples",
        type=int,
        default=8,
        help="Number of worst self-eval examples to print when verbose>=2",
    )
    args = parse_args_notebook_safe(parser)

    data_dir = find_data_dir()
    print(f"[INFO] Data directory: {data_dir}")
    train_df = pd.read_csv(data_dir / "train.csv")
    test_df = pd.read_csv(data_dir / "test.csv")
    translit_col, trans_col, test_id_col = infer_columns(train_df, test_df)
    print(f"[INFO] train rows={len(train_df)} | test rows={len(test_df)}")

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
            verbose=args.verbose,
            verbose_samples=args.verbose_samples,
        )
        print(f"[SELF-EVAL] Estimated holdout BLEU: {est_bleu:.2f}")

    model = HybridAkkadianTranslator(config=DecoderConfig(verbose=args.verbose))
    model.fit(train_df, translit_col=translit_col, trans_col=trans_col)
    predictions = model.translate_batch(test_df[translit_col].fillna("").tolist())
    if args.verbose >= 1:
        model.print_debug_summary()

    submission = pd.DataFrame({"id": test_df[test_id_col], "translation": predictions})
    submission.to_csv(args.output, index=False)
    print(f"[DONE] Wrote {len(submission)} rows -> {args.output}")


if __name__ == "__main__":
    main()
