/* Password hashing (scrypt) and cookie sessions. */

const crypto = require("node:crypto");
const db = require("./db");

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function createSession(practiceId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, practice_id, expires_at) VALUES (?, ?, ?)")
    .run(token, practiceId, Date.now() + SESSION_TTL_MS);
  return token;
}

function getPracticeForToken(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT p.* FROM sessions s JOIN practices p ON p.id = s.practice_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).get(token, Date.now());
  return row || null;
}

function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function newKioskCode() {
  // short, unambiguous, easy to type on a tablet
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let code;
  do {
    code = Array.from(crypto.randomBytes(6)).map(b => alphabet[b % alphabet.length]).join("");
  } while (db.prepare("SELECT 1 FROM practices WHERE kiosk_code = ?").get(code));
  return code;
}

module.exports = { hashPassword, verifyPassword, createSession, getPracticeForToken, destroySession, newKioskCode };
