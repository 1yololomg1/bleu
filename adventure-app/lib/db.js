/* SQLite storage (node:sqlite — no external deps).
   Photos and logos are stored as data-URL text; fine at clinic scale. */

const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.SYD_DB || path.join(__dirname, "..", "data", "syd.db");
require("node:fs").mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS practices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT NOT NULL UNIQUE,
    pass_hash    TEXT NOT NULL,
    name         TEXT NOT NULL,
    doctor_name  TEXT NOT NULL,
    office_desc  TEXT NOT NULL DEFAULT '',
    doctor_desc  TEXT NOT NULL DEFAULT '',
    doctor_photo TEXT NOT NULL DEFAULT '',
    logo         TEXT NOT NULL DEFAULT '',
    season       TEXT NOT NULL DEFAULT 'none',
    kiosk_code   TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    practice_id INTEGER NOT NULL REFERENCES practices(id),
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plays (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    practice_id  INTEGER NOT NULL REFERENCES practices(id),
    tier         TEXT NOT NULL,
    theme        TEXT NOT NULL,
    story_source TEXT NOT NULL DEFAULT 'builtin',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prints (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    practice_id  INTEGER NOT NULL REFERENCES practices(id),
    theme        TEXT NOT NULL,
    panels       INTEGER NOT NULL DEFAULT 0,
    amount_cents INTEGER NOT NULL DEFAULT 1000,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
