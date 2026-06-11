# 🌟 Select Your Destiny! — Waiting Room Adventures

A choose-your-own-adventure **comic book platform for pediatric offices**.
Kids pick a theme, make every choice, and star in a stick-figure comic where
**their own doctor and office appear throughout the story** — read aloud for
kids who can't read yet, with a brand-new AI-written story every visit.

Now a small hosted site: doctors log in to a dashboard, every practice gets its
own kiosk link, and every printout is metered (that's the billing record).

## Running it

```bash
cd adventure-app
npm install
ANTHROPIC_API_KEY=sk-ant-...   # optional — enables fresh AI stories
ADMIN_EMAIL=you@platform.com   # optional — that account sees all-practice revenue
npm start                      # http://localhost:3000
```

Node 22.5+ (uses the built-in `node:sqlite`). The only dependency is
`@anthropic-ai/sdk`. Data lives in `data/syd.db` (override with `SYD_DB`).

## How it works

### 1. Doctor dashboard (`/dashboard`)
Each practice creates an account and can update everything **any time, from
anywhere** — the waiting-room kiosk picks changes up instantly:
- Practice + doctor name, **office/waiting-room description** (opens every story)
- **Doctor description or photo** — photo puts the doctor's real face on their
  stick figure; otherwise the description is woven into the story text
- **Logo** — appears on signs and flags inside the comic panels
- **Seasonal mode** 🎄🎃 — winter/spring/summer/halloween adds seasonal art to
  every panel and a seasonal opening line (switch it on for the holidays, off in January)

The dashboard also shows the money side:
- Adventures played, **Star printouts all-time / this month**, and **$ collected
  at the counter** (each printout = $10 collected)
- A recent-printouts table per practice
- If `ADMIN_EMAIL` matches the logged-in account, an **all-practices table**
  (plays, prints, monthly counts, collected totals) — the platform's billing view

### 2. Kid kiosk (`/k/<code>`)
Every practice gets a unique kiosk link to open on the waiting-room tablet.

- **Four themes** (space, dinosaurs, ocean, superhero), branching stories,
  multiple endings, the doctor appearing throughout as the hero's helper
- **🔊 Read aloud** — captions and choices are spoken via the browser's built-in
  Web Speech API (no extra service, works offline), so pre-readers can play
  solo; toggleable, with a "read it again" button
- **✨ AI stories** — when `ANTHROPIC_API_KEY` is set, every adventure is written
  fresh by Claude (`claude-opus-4-8`, structured JSON output constrained to the
  exact scene vocabulary the SVG renderer understands, then server-side
  validated: reachability, endings, doctor appearances). If the API is slow,
  down, or returns something invalid, the kiosk silently falls back to the
  built-in story library — it never breaks in front of a kid.

### 3. Two editions — same stories, same art
| | 🎨 Classic — FREE | ⭐ Star Edition — $10 |
|---|---|---|
| Full comic adventure, every choice, read-aloud | ✅ | ✅ |
| Kid **and** grown-up's real faces on the stick figures (both portraits required) | — | ✅ |
| Printed keepsake of the whole adventure | — | ✅ |

### 4. Pay at the counter → print → it's metered
The Star Edition ending screen says to show it at the front desk and pay **$10**
on the way out. The front desk taps **"$10 collected — Print adventure"**, which
records the printout server-side (theme, panel count, $10) and prints the
take-home comic: title page with logo + "Starring …" + PAID badge, then every
panel of the exact path the kid chose. Those records are what the dashboard
totals — and what the platform bills practices from.

## Files

```
adventure-app/
├── server.js            # zero-framework Node server: auth, settings, kiosk API, metering
├── lib/
│   ├── db.js            # node:sqlite schema (practices, sessions, plays, prints)
│   ├── auth.js          # scrypt password hashing + cookie sessions
│   └── storygen.js      # Claude story generation: JSON-schema output + graph validation
└── public/
    ├── dashboard.html   # doctor login + settings + revenue stats (+ platform admin)
    ├── kiosk.html       # kid-facing flow
    ├── css/style.css
    └── js/
        ├── stories.js   # built-in story library (also the offline fallback)
        ├── scenes.js    # SVG comic renderer + seasonal overlays
        └── app.js       # kiosk flow, TTS, portraits, print
```

### 5. Child safety — the kiosk is a sealed box
- **Zero links off the page.** The kiosk has no navigation anywhere; the dashboard
  is a separate login-only URL the kiosk never references.
- **Staff PIN** (set in the dashboard) locks the front-desk
  "$10 collected — Print" button behind a keypad. The server re-verifies the PIN
  before recording the print, and locks out for 60s after 5 wrong tries (even
  for the correct PIN). Until a PIN is set, the button requires a deliberate
  3-second press-and-hold and the dashboard nags to set one.
- **Lockdown mode** on the kiosk page: auto fullscreen (re-entered on the next
  tap if escaped), no right-click/long-press menu, no text selection or drag,
  no pinch-zoom or pull-to-refresh, and a confirm dialog if something tries to
  leave the page mid-adventure.
- **Device-level pinning** completes the lock (a browser can't fully imprison
  itself): iPad Guided Access, Android app pinning / Fully Kiosk, or
  `chrome --kiosk <link>`. Instructions are shown in the dashboard.

## Production notes
- Serve over **HTTPS** (required for the kiosk camera; use any reverse proxy).
- Portraits taken at the kiosk stay **in the browser for that session only** —
  they are never uploaded. Only the doctor's photo/logo (uploaded by the
  practice) and anonymous play/print counts are stored server-side. Kid names
  go to the Claude API only for story personalization and are not stored.
- The kid's name and theme are sent to the story endpoint; no other patient
  data ever leaves the device. No PHI is collected or stored.
- Story cost: one Claude call per adventure (~a few cents on `claude-opus-4-8`;
  set `STORY_MODEL` to change models).
