/* AI story generation via the Claude API (@anthropic-ai/sdk).
   Generates a fresh branching story graph per visit, constrained by a JSON
   schema to the exact scene vocabulary the SVG renderer understands.
   If ANTHROPIC_API_KEY is unset or generation/validation fails, the caller
   falls back to the built-in story library — the kiosk never breaks. */

const STORY_MODEL = process.env.STORY_MODEL || "claude-opus-4-8";

// Must stay in sync with public/js/scenes.js
const VOCAB = {
  bgs: ["waiting", "space", "jungle", "ocean", "city", "party"],
  cast: ["kid", "adult", "doctor", "alien", "gremlin", "dino", "dinobaby", "octo", "turtle"],
  poses: ["stand", "wave", "point", "cheer", "run"],
  props: ["logoSign", "logoFlag", "stardoor", "rocket", "asteroids", "moon", "badge",
          "medal", "map", "jeep", "volcano", "ferns", "lilypads", "bigbubble", "sub",
          "clam", "confetti", "locker", "magnet", "banana", "clouds"]
};

const STORY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    emoji: { type: "string" },
    color: { type: "string" },
    start: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          ending: { type: "boolean" },
          endingTitle: { type: "string" },
          bg: { type: "string", enum: VOCAB.bgs },
          cast: {
            type: "array",
            items: {
              type: "object",
              properties: {
                who: { type: "string", enum: VOCAB.cast },
                x: { type: "integer" },
                pose: { type: "string", enum: VOCAB.poses },
                flip: { type: "boolean" },
                cape: { type: "boolean" }
              },
              required: ["who", "x", "pose", "flip", "cape"],
              additionalProperties: false
            }
          },
          props: { type: "array", items: { type: "string", enum: VOCAB.props } },
          bubbleWho: { type: "integer" },
          bubbleText: { type: "string" },
          choices: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, to: { type: "string" } },
              required: ["label", "to"],
              additionalProperties: false
            }
          }
        },
        required: ["id", "text", "ending", "endingTitle", "bg", "cast", "props",
                   "bubbleWho", "bubbleText", "choices"],
        additionalProperties: false
      }
    }
  },
  required: ["title", "emoji", "color", "start", "nodes"],
  additionalProperties: false
};

const SYSTEM = `You write interactive "choose your own adventure" comic stories for children
aged 3-8 visiting a pediatrician. The story is rendered as stick-figure comic panels by a
fixed SVG engine, so every scene must use ONLY the provided vocabulary.

Rules:
- 8 to 12 nodes. At least 3 non-ending nodes must offer exactly 2 choices. Other non-ending
  nodes may have 1 choice. Every choice "to" must reference an existing node id. Every node
  must be reachable from the start node, and at least 2 distinct ending nodes must exist.
- The FIRST node always uses bg "waiting": the adventure magically begins in the practice's
  waiting room. Its text must include the literal placeholder {office}.
- Ending nodes: ending=true, a fun endingTitle, bg "party", include the "confetti" prop, and
  an empty choices array. Non-ending nodes: ending=false, endingTitle "".
- The doctor character ("doctor" in cast) must appear in at least 2 different nodes, as a
  helpful, heroic, friendly figure (gadgets, rescues, medals, checkups). Use the placeholder
  {doctor} in those nodes' text.
- Use placeholders LITERALLY in text and choice labels: {kid} (the child hero), {adult}
  (their grown-up, who joins the whole adventure), {doctor}, {practice}, {office}. Never
  invent names for these people.
- cast: 1-3 characters per scene. x is the horizontal position, 150-650 (panel is 800 wide,
  characters stand on the ground). flip=true makes a character face left. cape=true only
  for superhero stories on the kid. Include "kid" in most scenes.
- bubbleWho is the index into cast of who speaks the short bubbleText (max 6 words);
  use bubbleWho=-1 and bubbleText="" for no speech bubble.
- props: 0-3 per scene from the list. "logoSign"/"logoFlag" show the practice's logo —
  include one of them in 2-3 scenes.
- Tone: warm, silly, brave, zero scary content, no violence, no sickness-shaming. Gentle
  positive associations with doctors and checkups. Short sentences that read aloud well.
- color: a dark-ish hex color matching the theme mood.`;

function buildPrompt({ theme, kidName, adultName, practice, doctorName, officeDesc, doctorDesc, season }) {
  const seasonNote = season && season !== "none"
    ? `It is currently ${season} season — weave one light seasonal touch into the text (no religious content).`
    : "";
  return `Write a brand-new adventure. Make it different from typical space/dino/ocean plots — surprise us within the theme.

Theme chosen by the child: ${theme}
Child's first name (for inspiration only — still use {kid} in text): ${kidName}
Grown-up: ${adultName || "a grown-up"}
Practice: ${practice}
Doctor: ${doctorName}${doctorDesc ? ` (described as: ${doctorDesc})` : ""}
Waiting room: ${officeDesc || "a friendly waiting room"}
${seasonNote}

Scene vocabulary (use nothing else):
- bg: ${VOCAB.bgs.join(", ")}
- cast who: ${VOCAB.cast.join(", ")} (dino=big friendly dinosaur, dinobaby=baby triceratops, octo=octopus, turtle=sea turtle, alien=friendly alien, gremlin=mischievous-but-sweet gremlin)
- pose: ${VOCAB.poses.join(", ")}
- props: ${VOCAB.props.join(", ")}`;
}

function validateStory(raw) {
  const errs = [];
  if (!Array.isArray(raw.nodes) || raw.nodes.length < 6 || raw.nodes.length > 16) {
    errs.push("bad node count");
  }
  const ids = new Set();
  for (const n of raw.nodes || []) {
    if (ids.has(n.id)) errs.push("duplicate id " + n.id);
    ids.add(n.id);
  }
  if (!ids.has(raw.start)) errs.push("start node missing");
  let endings = 0;
  for (const n of raw.nodes || []) {
    if (n.ending) { endings++; if (n.choices.length) errs.push(n.id + ": ending with choices"); }
    else if (!n.choices.length) errs.push(n.id + ": dead end");
    for (const c of n.choices) if (!ids.has(c.to)) errs.push(n.id + ": bad target " + c.to);
    if (!n.cast.length || n.cast.length > 4) errs.push(n.id + ": bad cast size");
    if (n.bubbleWho >= n.cast.length) errs.push(n.id + ": bubbleWho out of range");
  }
  if (endings < 2) errs.push("needs >=2 endings");
  // reachability from start
  const seen = new Set();
  const queue = [raw.start];
  const byId = Object.fromEntries((raw.nodes || []).map(n => [n.id, n]));
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id) || !byId[id]) continue;
    seen.add(id);
    for (const c of byId[id].choices) queue.push(c.to);
  }
  if (!(raw.nodes || []).some(n => seen.has(n.id) && n.ending)) errs.push("no reachable ending");
  const docNodes = (raw.nodes || []).filter(n => seen.has(n.id) && n.cast.some(c => c.who === "doctor"));
  if (docNodes.length < 1) errs.push("doctor never appears");
  return errs;
}

/* Convert the schema shape into the client's story-graph shape
   (same structure as the built-in THEMES entries). */
function toClientStory(raw) {
  const nodes = {};
  for (const n of raw.nodes) {
    nodes[n.id] = {
      text: n.text,
      ending: n.ending || undefined,
      title: n.ending ? (n.endingTitle || "The End") : undefined,
      scene: {
        bg: n.bg,
        cast: n.cast.map(c => ({
          who: c.who,
          x: Math.max(120, Math.min(680, c.x)),
          pose: c.pose,
          flip: c.flip || undefined,
          cape: c.cape || undefined
        })),
        props: n.props
      },
      bubble: n.bubbleWho >= 0 && n.bubbleText
        ? { who: n.bubbleWho, text: n.bubbleText } : undefined,
      choices: n.ending ? undefined : n.choices
    };
  }
  return { name: raw.title, emoji: raw.emoji || "✨", color: raw.color || "#1565c0", start: raw.start, nodes };
}

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    const Anthropic = require("@anthropic-ai/sdk");
    client = new Anthropic();
  }
  return client;
}

async function generateStory(params) {
  const anthropic = getClient();
  if (!anthropic) throw new Error("no API key configured");

  const response = await anthropic.messages.create({
    model: STORY_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: STORY_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(params) }]
  });

  if (response.stop_reason === "refusal") throw new Error("model refused");
  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock) throw new Error("no text in response");
  const raw = JSON.parse(textBlock.text);
  const errs = validateStory(raw);
  if (errs.length) throw new Error("invalid story: " + errs.join("; "));
  return toClientStory(raw);
}

module.exports = { generateStory, validateStory, toClientStory, STORY_SCHEMA, VOCAB };
