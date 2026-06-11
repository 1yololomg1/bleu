/* Select Your Destiny — server
   Built-in http + node:sqlite; the only dependency is @anthropic-ai/sdk.
   Run: node server.js   (PORT, ANTHROPIC_API_KEY, ADMIN_EMAIL optional) */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const db = require("./lib/db");
const auth = require("./lib/auth");
const storygen = require("./lib/storygen");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();
const MAX_BODY = 16 * 1024 * 1024; // photos arrive as data URLs

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

/* ---------- helpers ---------- */

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie",
    `syd_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`);
}

function currentPractice(req) {
  return auth.getPracticeForToken(getCookie(req, "syd_session"));
}

function sameOriginOk(req) {
  // basic CSRF guard for state-changing requests
  const origin = req.headers.origin;
  if (!origin) return true; // curl / same-origin form posts without Origin
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

function publicConfig(p) {
  return {
    practice: p.name, doctorName: p.doctor_name,
    officeDesc: p.office_desc, doctorDesc: p.doctor_desc,
    doctorPhoto: p.doctor_photo, logo: p.logo, season: p.season,
    aiStories: !!process.env.ANTHROPIC_API_KEY,
    hasPin: !!p.staff_pin_hash
  };
}

/* staff-PIN brute-force guard: 5 wrong tries → 60s lockout per practice */
const pinAttempts = new Map(); // practiceId -> { fails, lockUntil }

function checkPin(p, pin) {
  if (!p.staff_pin_hash) return { ok: true };
  const entry = pinAttempts.get(p.id) || { fails: 0, lockUntil: 0 };
  if (Date.now() < entry.lockUntil) return { ok: false, locked: true };
  if (pin && auth.verifyPassword(String(pin), p.staff_pin_hash)) {
    pinAttempts.delete(p.id);
    return { ok: true };
  }
  entry.fails++;
  if (entry.fails >= 5) { entry.fails = 0; entry.lockUntil = Date.now() + 60_000; }
  pinAttempts.set(p.id, entry);
  return { ok: false, locked: Date.now() < entry.lockUntil };
}

const SETTABLE = ["name", "doctor_name", "office_desc", "doctor_desc", "doctor_photo", "logo", "season"];
const SEASONS = ["none", "winter", "spring", "summer", "halloween"];

function statsFor(practiceId) {
  const q = (sql, ...args) => db.prepare(sql).get(...args);
  return {
    plays: q("SELECT COUNT(*) n FROM plays WHERE practice_id = ?", practiceId).n,
    starPlays: q("SELECT COUNT(*) n FROM plays WHERE practice_id = ? AND tier = 'star'", practiceId).n,
    prints: q("SELECT COUNT(*) n FROM prints WHERE practice_id = ?", practiceId).n,
    printsThisMonth: q(
      "SELECT COUNT(*) n FROM prints WHERE practice_id = ? AND created_at >= date('now','start of month')",
      practiceId).n,
    collectedCents: q("SELECT COALESCE(SUM(amount_cents),0) n FROM prints WHERE practice_id = ?", practiceId).n,
    recentPrints: db.prepare(
      "SELECT theme, panels, amount_cents, created_at FROM prints WHERE practice_id = ? ORDER BY id DESC LIMIT 15"
    ).all(practiceId)
  };
}

/* ---------- API routes ---------- */

const routes = {

  "POST /api/signup": async (req, res, body) => {
    const { email, password, practice, doctorName } = body;
    if (!email || !password || !practice || !doctorName) return json(res, 400, { error: "All fields are required." });
    if (String(password).length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
    const normEmail = String(email).trim().toLowerCase();
    if (db.prepare("SELECT 1 FROM practices WHERE email = ?").get(normEmail)) {
      return json(res, 409, { error: "An account with that email already exists." });
    }
    const info = db.prepare(
      "INSERT INTO practices (email, pass_hash, name, doctor_name, kiosk_code) VALUES (?, ?, ?, ?, ?)"
    ).run(normEmail, auth.hashPassword(password), String(practice).trim(), String(doctorName).trim(), auth.newKioskCode());
    setSessionCookie(res, auth.createSession(Number(info.lastInsertRowid)));
    json(res, 200, { ok: true });
  },

  "POST /api/login": async (req, res, body) => {
    const p = db.prepare("SELECT * FROM practices WHERE email = ?").get(String(body.email || "").trim().toLowerCase());
    if (!p || !auth.verifyPassword(String(body.password || ""), p.pass_hash)) {
      return json(res, 401, { error: "Wrong email or password." });
    }
    setSessionCookie(res, auth.createSession(p.id));
    json(res, 200, { ok: true });
  },

  "POST /api/logout": async (req, res) => {
    auth.destroySession(getCookie(req, "syd_session"));
    res.setHeader("Set-Cookie", "syd_session=; Path=/; Max-Age=0");
    json(res, 200, { ok: true });
  },

  "GET /api/me": async (req, res) => {
    const p = currentPractice(req);
    if (!p) return json(res, 401, { error: "Not logged in." });
    json(res, 200, {
      email: p.email, kioskCode: p.kiosk_code, isAdmin: !!ADMIN_EMAIL && p.email === ADMIN_EMAIL,
      hasPin: !!p.staff_pin_hash,
      settings: {
        name: p.name, doctor_name: p.doctor_name, office_desc: p.office_desc,
        doctor_desc: p.doctor_desc, doctor_photo: p.doctor_photo, logo: p.logo, season: p.season
      },
      aiStories: !!process.env.ANTHROPIC_API_KEY,
      stats: statsFor(p.id)
    });
  },

  "PUT /api/practice": async (req, res, body) => {
    const p = currentPractice(req);
    if (!p) return json(res, 401, { error: "Not logged in." });
    if (body.season && !SEASONS.includes(body.season)) return json(res, 400, { error: "Bad season." });
    if (body.name !== undefined && !String(body.name).trim()) return json(res, 400, { error: "Practice name required." });
    if (body.doctor_name !== undefined && !String(body.doctor_name).trim()) return json(res, 400, { error: "Doctor name required." });
    if (body.removePin) {
      db.prepare("UPDATE practices SET staff_pin_hash = '' WHERE id = ?").run(p.id);
    } else if (body.staffPin) {
      if (!/^\d{4,8}$/.test(String(body.staffPin))) return json(res, 400, { error: "Staff PIN must be 4–8 digits." });
      db.prepare("UPDATE practices SET staff_pin_hash = ? WHERE id = ?").run(auth.hashPassword(String(body.staffPin)), p.id);
    }
    for (const field of SETTABLE) {
      if (body[field] !== undefined) {
        db.prepare(`UPDATE practices SET ${field} = ? WHERE id = ?`).run(String(body[field]), p.id);
      }
    }
    json(res, 200, { ok: true });
  },

  "GET /api/admin/stats": async (req, res) => {
    const p = currentPractice(req);
    if (!p || !ADMIN_EMAIL || p.email !== ADMIN_EMAIL) return json(res, 403, { error: "Admins only." });
    const rows = db.prepare(`
      SELECT p.id, p.name, p.email, p.created_at,
        (SELECT COUNT(*) FROM plays  WHERE practice_id = p.id) plays,
        (SELECT COUNT(*) FROM prints WHERE practice_id = p.id) prints,
        (SELECT COUNT(*) FROM prints WHERE practice_id = p.id
           AND created_at >= date('now','start of month')) prints_this_month,
        (SELECT COALESCE(SUM(amount_cents),0) FROM prints WHERE practice_id = p.id) collected_cents
      FROM practices p ORDER BY prints DESC`).all();
    json(res, 200, { practices: rows });
  }
};

/* kiosk routes are keyed by code in the path: /api/kiosk/:code/... */
async function kioskRoute(req, res, code, action, body) {
  const p = db.prepare("SELECT * FROM practices WHERE kiosk_code = ?").get(code);
  if (!p) return json(res, 404, { error: "Unknown kiosk code." });

  if (req.method === "GET" && action === "config") {
    return json(res, 200, publicConfig(p));
  }

  if (req.method === "POST" && action === "story") {
    try {
      const story = await storygen.generateStory({
        theme: String(body.theme || "adventure").slice(0, 40),
        kidName: String(body.kidName || "").slice(0, 30),
        adultName: String(body.adultName || "").slice(0, 30),
        practice: p.name, doctorName: p.doctor_name,
        officeDesc: p.office_desc, doctorDesc: p.doctor_desc, season: p.season
      });
      return json(res, 200, { source: "ai", story });
    } catch (e) {
      console.error("story generation failed:", e.message);
      return json(res, 200, { source: "builtin" }); // client uses its built-in library
    }
  }

  if (req.method === "POST" && action === "play") {
    db.prepare("INSERT INTO plays (practice_id, tier, theme, story_source) VALUES (?, ?, ?, ?)")
      .run(p.id, body.tier === "star" ? "star" : "classic",
           String(body.theme || "").slice(0, 40), body.source === "ai" ? "ai" : "builtin");
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && action === "pin") {
    const result = checkPin(p, body.pin);
    return json(res, result.ok ? 200 : 403, result);
  }

  if (req.method === "POST" && action === "print") {
    const result = checkPin(p, body.pin); // staff-only: kids can't trigger the $10 print
    if (!result.ok) return json(res, 403, result);
    db.prepare("INSERT INTO prints (practice_id, theme, panels, amount_cents) VALUES (?, ?, ?, 1000)")
      .run(p.id, String(body.theme || "").slice(0, 40), Number(body.panels) || 0);
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: "Unknown kiosk action." });
}

/* ---------- request dispatch ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith("/api/")) {
      if (req.method !== "GET" && !sameOriginOk(req)) return json(res, 403, { error: "Bad origin." });
      const body = req.method === "GET" ? {} : await readBody(req);

      const kioskMatch = pathname.match(/^\/api\/kiosk\/([a-z0-9]+)\/(\w+)$/);
      if (kioskMatch) return await kioskRoute(req, res, kioskMatch[1], kioskMatch[2], body);

      const handler = routes[`${req.method} ${pathname}`];
      if (handler) return await handler(req, res, body);
      return json(res, 404, { error: "Not found." });
    }

    if (pathname === "/" ) {
      res.writeHead(302, { Location: "/dashboard" });
      return res.end();
    }
    if (pathname === "/dashboard") return serveFile(res, path.join(PUBLIC_DIR, "dashboard.html"));
    if (/^\/k\/[a-z0-9]+$/.test(pathname)) return serveFile(res, path.join(PUBLIC_DIR, "kiosk.html"));

    // static assets
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(PUBLIC_DIR, safe);
    if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return serveFile(res, filePath);
    }
    res.writeHead(404); res.end("Not found");
  } catch (e) {
    console.error(req.method, pathname, e.message);
    if (!res.headersSent) json(res, 500, { error: "Server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Select Your Destiny running at http://localhost:${PORT}`);
  console.log(`AI stories: ${process.env.ANTHROPIC_API_KEY ? `ON (${storygen.STORY_MODEL || "claude-opus-4-8"})` : "OFF — using built-in story library (set ANTHROPIC_API_KEY to enable)"}`);
});
