# 🌟 Select Your Destiny! — Waiting Room Adventures

A choose-your-own-adventure **comic book webapp for pediatric offices**.
Kids pick a theme, make every choice, and star in a stick-figure comic where
**their own doctor and office appear throughout the story**.

No server, no build step, no accounts — a single static page that runs on any
waiting-room tablet or kiosk browser. Open `index.html` and go.

## How it works

### 1. One-time practice setup (staff)
The ⚙️ Staff button opens a setup screen where the office enters:
- **Practice name** and **doctor's name** — woven into every story
- **A description of the office/waiting room** — becomes the opening of each adventure
- **A description of the doctor** *or* **the doctor's photo** — if there's a photo,
  the doctor's real face appears on their stick figure; otherwise the written
  description is woven into the story when the doctor first appears
- **Practice logo** (optional) — shows up on signs, flags and rocket banners inside the panels

Settings are saved in the browser (`localStorage`), so setup happens once per device.

### 2. Kid picks an adventure
Four themes, each a branching story with multiple endings (~5–7 panels per playthrough):
- 🚀 **Blast Off to Space**
- 🦕 **Dinosaur Discovery**
- 🐙 **Deep Sea Quest**
- 🦸 **Super Hero Day**

The doctor appears throughout each story — handing out space badges, arriving in a
jungle jeep, diving in with waterproof bandages, springing sticker traps.

### 3. Two editions — same stories, same art
| | 🎨 Classic — FREE | ⭐ Star Edition — $10 |
|---|---|---|
| Full comic adventure, every choice | ✅ | ✅ |
| Kid **and** grown-up's real faces on the stick figures (both portraits required) | — | ✅ |
| Printed keepsake of the whole adventure | — | ✅ |

Star Edition portraits are taken right at the kiosk (webcam) or uploaded — the
kid's **and** the adult's, both required before the story starts.

### 4. Pay at the counter, leave with a comic
The Star Edition ending screen says to show it at the front desk and pay **$10**
on the way out. The front desk hits **"$10 collected — Print adventure"**, which
prints a take-home comic: a title page (logo, practice name, story title,
"Starring …", PAID badge) followed by every panel of the exact path the kid chose.

## Files

```
adventure-app/
├── index.html        # all views: setup, start, portraits, story, ending, print
├── css/style.css     # comic-book styling + print stylesheet
└── js/
    ├── stories.js    # 4 themed branching story graphs (33 panels)
    ├── scenes.js     # SVG comic renderer: stick figures, photo faces, props, bubbles
    └── app.js        # flow, templating, portraits/camera, payment + print
```

## Notes
- Photos and the logo never leave the device — everything is stored locally in the browser.
- "New adventure" resets for the next kid; portraits are kept only for the current session.
- Camera capture needs HTTPS (or localhost) in most browsers; the Upload button always works.
