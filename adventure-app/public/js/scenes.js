/* ============================================================
   Select Your Destiny — Comic Scene Renderer
   Renders each story panel as an SVG comic: simple stick-figure
   cartoon style, thick outlines, halftone dots, speech bubbles.
   Paid "Star Edition" swaps drawn faces for real photo faces.
   ============================================================ */

let _uid = 0;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- stick-figure characters ---------- */

const KINDS = {
  kid:    { s: 0.85, color: "#e65100", skin: "#ffd9a0" },
  adult:  { s: 1.12, color: "#1565c0", skin: "#ffd9a0" },
  doctor: { s: 1.08, color: "#00838f", skin: "#ffd9a0" },
  alien:  { s: 0.80, color: "#388e3c", skin: "#a5d6a7" },
  gremlin:{ s: 0.72, color: "#6a1b9a", skin: "#ce93d8" }
};

const POSES = {
  stand: { aL: [-24, 32], aR: [24, 32],  lL: [-16, 0], lR: [16, 0], lean: 0 },
  wave:  { aL: [-24, 32], aR: [34, -28], lL: [-16, 0], lR: [16, 0], lean: 0 },
  point: { aL: [-20, 30], aR: [44, -4],  lL: [-16, 0], lR: [16, 0], lean: 2 },
  cheer: { aL: [-32, -30],aR: [32, -30], lL: [-20, 0], lR: [20, 0], lean: 0 },
  run:   { aL: [-30, -8], aR: [32, 14],  lL: [-30, -4],lR: [26, 0], lean: 8 }
};

function faceMarkup(cx, cy, r, photo, kind, uid) {
  if (photo) {
    return `
      <clipPath id="face${uid}"><circle cx="${cx}" cy="${cy}" r="${r - 2}"/></clipPath>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#222" stroke-width="4"/>
      <image href="${photo}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#face${uid})"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#222" stroke-width="4"/>`;
  }
  const k = KINDS[kind] || KINDS.kid;
  let extras = "";
  if (kind === "doctor") {
    extras = `<rect x="${cx - r * 0.75}" y="${cy - r * 0.25}" width="${r * 0.6}" height="${r * 0.35}" rx="3" fill="none" stroke="#222" stroke-width="2.5"/>
              <rect x="${cx + r * 0.15}" y="${cy - r * 0.25}" width="${r * 0.6}" height="${r * 0.35}" rx="3" fill="none" stroke="#222" stroke-width="2.5"/>
              <line x1="${cx - r * 0.15}" y1="${cy - r * 0.1}" x2="${cx + r * 0.15}" y2="${cy - r * 0.1}" stroke="#222" stroke-width="2.5"/>`;
  }
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${k.skin}" stroke="#222" stroke-width="4"/>
    <circle cx="${cx - r * 0.35}" cy="${cy - r * 0.15}" r="2.6" fill="#222"/>
    <circle cx="${cx + r * 0.35}" cy="${cy - r * 0.15}" r="2.6" fill="#222"/>
    <path d="M ${cx - r * 0.4} ${cy + r * 0.25} Q ${cx} ${cy + r * 0.65} ${cx + r * 0.4} ${cy + r * 0.25}"
          fill="none" stroke="#222" stroke-width="3" stroke-linecap="round"/>
    ${extras}`;
}

function humanoid(c, ctx) {
  const kind = c.who;
  const k = KINDS[kind] || KINDS.kid;
  const s = k.s * (c.scale || 1);
  const x = c.x, y = c.y || 392;
  const pose = POSES[c.pose] || POSES.stand;
  const uid = ++_uid;

  const hip = -52 * s, neck = -98 * s, sh = -90 * s;
  const headR = 23 * s;
  const headCY = neck - headR + 4;
  const photo = ctx.faces ? ctx.faces[kind] : null;
  const sw = 5 * s;
  let parts = [];

  // cape (behind body)
  if (c.cape) {
    parts.push(`<path d="M 0 ${sh} Q -38 ${hip - 10} -30 ${hip + 34} Q -8 ${hip + 18} 0 ${hip + 6} Z"
      fill="#d32f2f" stroke="#222" stroke-width="3"/>`);
  }
  // doctor coat (behind limbs)
  if (kind === "doctor") {
    parts.push(`<path d="M -16 ${sh + 2} L 16 ${sh + 2} L 20 ${hip + 26} L -20 ${hip + 26} Z"
      fill="#fff" stroke="#222" stroke-width="3.5"/>
      <line x1="0" y1="${sh + 6}" x2="0" y2="${hip + 22}" stroke="#222" stroke-width="2"/>`);
  }
  // legs
  parts.push(`<line x1="0" y1="${hip}" x2="${pose.lL[0] * s}" y2="${pose.lL[1]}" stroke="${k.color}" stroke-width="${sw}" stroke-linecap="round"/>`);
  parts.push(`<line x1="0" y1="${hip}" x2="${pose.lR[0] * s}" y2="${pose.lR[1]}" stroke="${k.color}" stroke-width="${sw}" stroke-linecap="round"/>`);
  // body
  parts.push(`<line x1="0" y1="${hip}" x2="0" y2="${neck}" stroke="${k.color}" stroke-width="${sw}" stroke-linecap="round"/>`);
  // arms
  parts.push(`<line x1="0" y1="${sh}" x2="${pose.aL[0] * s}" y2="${sh + pose.aL[1] * s}" stroke="${k.color}" stroke-width="${sw}" stroke-linecap="round"/>`);
  parts.push(`<line x1="0" y1="${sh}" x2="${pose.aR[0] * s}" y2="${sh + pose.aR[1] * s}" stroke="${k.color}" stroke-width="${sw}" stroke-linecap="round"/>`);
  // stethoscope
  if (kind === "doctor") {
    parts.push(`<path d="M -8 ${neck + 6} Q -14 ${sh + 26 * s} -6 ${sh + 34 * s}" fill="none" stroke="#37474f" stroke-width="3"/>
      <circle cx="-6" cy="${sh + 36 * s}" r="${5 * s}" fill="#37474f"/>`);
  }
  // alien antennae
  if (kind === "alien") {
    parts.push(`<line x1="-8" y1="${headCY - headR}" x2="-16" y2="${headCY - headR - 16}" stroke="#222" stroke-width="3"/>
      <circle cx="-16" cy="${headCY - headR - 18}" r="5" fill="#76ff03" stroke="#222" stroke-width="2.5"/>
      <line x1="8" y1="${headCY - headR}" x2="16" y2="${headCY - headR - 16}" stroke="#222" stroke-width="3"/>
      <circle cx="16" cy="${headCY - headR - 18}" r="5" fill="#76ff03" stroke="#222" stroke-width="2.5"/>`);
  }
  // gremlin ears + tail
  if (kind === "gremlin") {
    parts.push(`<path d="M ${-headR * 0.8} ${headCY - 6} l -12 -14 l 4 16 Z" fill="${k.skin}" stroke="#222" stroke-width="3"/>
      <path d="M ${headR * 0.8} ${headCY - 6} l 12 -14 l -4 16 Z" fill="${k.skin}" stroke="#222" stroke-width="3"/>
      <path d="M 0 ${hip} Q -30 ${hip + 14} -34 ${hip - 12}" fill="none" stroke="${k.color}" stroke-width="4" stroke-linecap="round"/>`);
  }
  // head + face
  parts.push(faceMarkup(0, headCY, headR, photo, kind, uid));

  // name label
  const label = c.label || (ctx.names && ctx.names[kind]);
  if (label) {
    parts.push(`<text x="0" y="22" text-anchor="middle" class="charLabel">${esc(label)}</text>`);
  }

  const flip = c.flip ? " scale(-1,1)" : "";
  // un-flip the label and face image so they stay readable
  let inner = parts.join("\n");
  if (c.flip) {
    inner = parts.map(p =>
      (p.includes("charLabel") || p.includes("<image")) ? `<g transform="scale(-1,1)">${p}</g>` : p
    ).join("\n");
  }
  return `<g transform="translate(${x},${y})${flip}">${inner}</g>`;
}

/* ---------- friendly creatures ---------- */

function creature(c, ctx) {
  const x = c.x, y = c.y || 392;
  const flip = c.flip ? " scale(-1,1)" : "";
  let inner = "";
  switch (c.who) {
    case "dino":
      inner = `
        <ellipse cx="0" cy="-55" rx="85" ry="48" fill="#66bb6a" stroke="#222" stroke-width="4"/>
        <path d="M 70 -75 Q 110 -130 118 -160" fill="none" stroke="#66bb6a" stroke-width="22" stroke-linecap="round"/>
        <circle cx="122" cy="-168" r="20" fill="#66bb6a" stroke="#222" stroke-width="4"/>
        <circle cx="128" cy="-172" r="3" fill="#222"/>
        <path d="M 116 -158 Q 126 -152 134 -158" fill="none" stroke="#222" stroke-width="2.5"/>
        <path d="M -75 -60 Q -130 -55 -140 -30" fill="none" stroke="#66bb6a" stroke-width="16" stroke-linecap="round"/>
        <line x1="-45" y1="-18" x2="-45" y2="0" stroke="#2e7d32" stroke-width="14" stroke-linecap="round"/>
        <line x1="45" y1="-18" x2="45" y2="0" stroke="#2e7d32" stroke-width="14" stroke-linecap="round"/>`;
      break;
    case "dinobaby":
      inner = `
        <ellipse cx="0" cy="-32" rx="42" ry="26" fill="#9ccc65" stroke="#222" stroke-width="4"/>
        <circle cx="42" cy="-52" r="18" fill="#9ccc65" stroke="#222" stroke-width="4"/>
        <path d="M 30 -66 l -6 -12 M 42 -70 l 0 -13 M 54 -66 l 6 -12" stroke="#558b2f" stroke-width="5" stroke-linecap="round"/>
        <circle cx="46" cy="-56" r="3" fill="#222"/>
        <path d="M 38 -44 Q 46 -38 54 -44" fill="none" stroke="#222" stroke-width="2.5"/>
        <path d="M -40 -34 Q -64 -30 -70 -16" fill="none" stroke="#9ccc65" stroke-width="10" stroke-linecap="round"/>
        <line x1="-20" y1="-10" x2="-20" y2="0" stroke="#558b2f" stroke-width="9" stroke-linecap="round"/>
        <line x1="20" y1="-10" x2="20" y2="0" stroke="#558b2f" stroke-width="9" stroke-linecap="round"/>`;
      break;
    case "octo":
      inner = `
        <path d="M -40 -40 Q -40 -95 0 -95 Q 40 -95 40 -40 Z" fill="#ef6292" stroke="#222" stroke-width="4"/>
        ${[-34, -17, 0, 17, 34].map(lx =>
          `<path d="M ${lx} -42 Q ${lx + 8} -18 ${lx - 6} 0" fill="none" stroke="#ef6292" stroke-width="9" stroke-linecap="round"/>`).join("")}
        <circle cx="-12" cy="-66" r="4" fill="#222"/>
        <circle cx="12" cy="-66" r="4" fill="#222"/>
        <path d="M -12 -54 Q 0 -45 12 -54" fill="none" stroke="#222" stroke-width="3"/>`;
      break;
    case "turtle":
      inner = `
        <path d="M -48 -10 Q -48 -58 0 -58 Q 48 -58 48 -10 Z" fill="#8d6e63" stroke="#222" stroke-width="4"/>
        <path d="M -24 -34 h 16 v 14 h -16 Z M 8 -34 h 16 v 14 h -16 Z" fill="none" stroke="#5d4037" stroke-width="2.5"/>
        <circle cx="56" cy="-22" r="13" fill="#a5d6a7" stroke="#222" stroke-width="4"/>
        <circle cx="60" cy="-25" r="2.6" fill="#222"/>
        <path d="M 52 -16 Q 58 -12 64 -16" fill="none" stroke="#222" stroke-width="2.5"/>
        <line x1="-34" y1="-8" x2="-38" y2="0" stroke="#a5d6a7" stroke-width="9" stroke-linecap="round"/>
        <line x1="30" y1="-8" x2="34" y2="0" stroke="#a5d6a7" stroke-width="9" stroke-linecap="round"/>`;
      break;
    default:
      return humanoid(c, ctx);
  }
  const label = c.label;
  if (label) inner += `<text x="0" y="22" text-anchor="middle" class="charLabel">${esc(label)}</text>`;
  return `<g transform="translate(${x},${y})${flip}">${inner}</g>`;
}

const HUMANOIDS = new Set(["kid", "adult", "doctor", "alien", "gremlin"]);

/* ---------- backgrounds ---------- */

const BGS = {
  waiting(ctx) {
    return `
      <rect width="800" height="450" fill="#fff8e1"/>
      <rect y="370" width="800" height="80" fill="#bcaaa4"/>
      <line x1="0" y1="370" x2="800" y2="370" stroke="#222" stroke-width="3"/>
      <rect x="60" y="70" width="130" height="100" rx="6" fill="#b3e5fc" stroke="#222" stroke-width="4"/>
      <line x1="125" y1="70" x2="125" y2="170" stroke="#222" stroke-width="3"/>
      <line x1="60" y1="120" x2="190" y2="120" stroke="#222" stroke-width="3"/>
      <circle cx="95" cy="95" r="12" fill="#fff176" stroke="#fbc02d" stroke-width="3"/>
      <rect x="640" y="300" width="90" height="70" rx="6" fill="#80deea" stroke="#222" stroke-width="4"/>
      <ellipse cx="668" cy="330" rx="9" ry="6" fill="#ff8a65"/>
      <ellipse cx="700" cy="348" rx="8" ry="5" fill="#ffd54f"/>
      <circle cx="685" cy="312" r="2.5" fill="#fff"/>
      <path d="M 580 370 q 4 -50 18 -58 q 14 8 18 58" fill="#66bb6a" stroke="#222" stroke-width="3"/>
      <rect x="586" y="370" width="26" height="14" fill="#d84315" stroke="#222" stroke-width="3"/>`;
  },
  space() {
    let stars = "";
    const pts = [[60,40],[150,110],[260,30],[380,90],[480,40],[600,120],[700,50],[740,160],[90,200],[680,230],[200,170],[520,180]];
    for (const [sx, sy] of pts) stars += `<circle cx="${sx}" cy="${sy}" r="3" fill="#fff59d"/>`;
    return `
      <rect width="800" height="450" fill="#1a1a4e"/>
      ${stars}
      <circle cx="690" cy="80" r="34" fill="#ce93d8" stroke="#222" stroke-width="3"/>
      <ellipse cx="690" cy="80" rx="52" ry="10" fill="none" stroke="#f48fb1" stroke-width="5"/>
      <path d="M 0 400 Q 200 370 400 400 T 800 395 L 800 450 L 0 450 Z" fill="#9fa8da" stroke="#222" stroke-width="3"/>
      <ellipse cx="180" cy="415" rx="26" ry="8" fill="#7986cb"/>
      <ellipse cx="600" cy="425" rx="32" ry="9" fill="#7986cb"/>`;
  },
  jungle() {
    return `
      <rect width="800" height="450" fill="#e0f7fa"/>
      <circle cx="700" cy="60" r="34" fill="#ffeb3b" stroke="#222" stroke-width="3"/>
      <path d="M 0 320 Q 200 250 420 320 T 800 310 L 800 450 L 0 450 Z" fill="#aed581" stroke="#222" stroke-width="3"/>
      <rect y="395" width="800" height="55" fill="#8bc34a"/>
      <g stroke="#222" stroke-width="3">
        <rect x="80" y="230" width="16" height="110" fill="#8d6e63"/>
        <path d="M 88 235 q -55 -25 -70 5 q 35 8 70 0 Z" fill="#43a047"/>
        <path d="M 88 235 q 55 -25 70 5 q -35 8 -70 0 Z" fill="#43a047"/>
        <path d="M 88 232 q 0 -40 -25 -50 q 8 30 20 48 Z" fill="#66bb6a"/>
      </g>`;
  },
  ocean() {
    let bub = "";
    const pts = [[120,90],[180,150],[640,80],[700,170],[420,60],[300,120],[560,140]];
    for (const [bx, by] of pts) bub += `<circle cx="${bx}" cy="${by}" r="8" fill="none" stroke="#b3e5fc" stroke-width="3"/>`;
    return `
      <rect width="800" height="450" fill="#0288d1"/>
      <rect width="800" height="160" fill="#29b6f6"/>
      ${bub}
      <path d="M 0 410 Q 400 390 800 412 L 800 450 L 0 450 Z" fill="#ffe082" stroke="#222" stroke-width="3"/>
      <path d="M 70 410 q -12 -50 8 -90 q 16 45 4 90" fill="#2e7d32" opacity="0.85"/>
      <path d="M 740 412 q -12 -40 6 -75 q 14 38 4 75" fill="#2e7d32" opacity="0.85"/>
      <g>
        <ellipse cx="520" cy="110" rx="20" ry="11" fill="#ffd54f" stroke="#222" stroke-width="3"/>
        <path d="M 540 110 l 14 -9 v 18 Z" fill="#ffd54f" stroke="#222" stroke-width="3"/>
        <circle cx="512" cy="107" r="2.4" fill="#222"/>
      </g>`;
  },
  city() {
    return `
      <rect width="800" height="450" fill="#bbdefb"/>
      <circle cx="100" cy="70" r="30" fill="#fff176" stroke="#222" stroke-width="3"/>
      <g stroke="#222" stroke-width="3">
        <rect x="180" y="150" width="90" height="220" fill="#90a4ae"/>
        <rect x="300" y="100" width="110" height="270" fill="#b0bec5"/>
        <rect x="440" y="170" width="80" height="200" fill="#90a4ae"/>
        <rect x="550" y="120" width="120" height="250" fill="#cfd8dc"/>
      </g>
      ${[[195,170],[230,170],[195,220],[230,220],[320,120],[360,120],[320,180],[360,180],[570,140],[610,140],[570,200],[610,200]]
        .map(([wx, wy]) => `<rect x="${wx}" y="${wy}" width="22" height="26" fill="#fff9c4" stroke="#222" stroke-width="2"/>`).join("")}
      <rect y="370" width="800" height="80" fill="#78909c"/>
      <line x1="0" y1="370" x2="800" y2="370" stroke="#222" stroke-width="3"/>
      ${[40, 180, 320, 460, 600, 740].map(dx => `<rect x="${dx}" y="406" width="50" height="7" rx="3" fill="#fff"/>`).join("")}`;
  },
  party() {
    let bunting = "";
    for (let i = 0; i < 10; i++) {
      const bx = 20 + i * 80;
      bunting += `<path d="M ${bx} 40 L ${bx + 25} 85 L ${bx + 50} 40" fill="${["#ef5350","#ffca28","#66bb6a","#42a5f5","#ab47bc"][i % 5]}" stroke="#222" stroke-width="2.5"/>`;
    }
    return `
      <rect width="800" height="450" fill="#fff3e0"/>
      <circle cx="400" cy="225" r="260" fill="#ffe0b2" opacity="0.7"/>
      <path d="M 0 38 Q 400 70 800 38" fill="none" stroke="#222" stroke-width="3"/>
      ${bunting}
      <rect y="385" width="800" height="65" fill="#ffcc80"/>
      <line x1="0" y1="385" x2="800" y2="385" stroke="#222" stroke-width="3"/>`;
  }
};

/* ---------- props ---------- */

function logoBox(x, y, w, h, ctx) {
  if (ctx.logo) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#fff" stroke="#222" stroke-width="3.5"/>
      <image href="${ctx.logo}" x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const initial = (ctx.names && ctx.names.practice ? ctx.names.practice : "Dr").trim().charAt(0).toUpperCase();
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#fff" stroke="#222" stroke-width="3.5"/>
    <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central"
          font-size="${h * 0.55}" font-weight="bold" fill="${ctx.themeColor || "#1565c0"}" font-family="inherit">${esc(initial)}</text>`;
}

const PROPS = {
  logoSign: ctx => `${logoBox(450, 80, 110, 80, ctx)}
    <text x="505" y="180" text-anchor="middle" class="charLabel">${esc((ctx.names && ctx.names.practice) || "")}</text>`,
  logoFlag: ctx => `<line x1="722" y1="392" x2="722" y2="240" stroke="#222" stroke-width="5"/>
    ${logoBox(722, 240, 64, 46, ctx)}`,
  stardoor: () => `<g stroke="#222" stroke-width="4">
    <rect x="600" y="200" width="100" height="170" rx="8" fill="#311b92"/>
    <circle cx="650" cy="285" r="30" fill="#7c4dff" opacity="0.8"/>
    <path d="M 650 265 l 6 14 15 1 -11 10 4 15 -14 -9 -14 9 4 -15 -11 -10 15 -1 Z" fill="#ffee58" stroke-width="2.5"/>
  </g>`,
  rocket: () => `<g stroke="#222" stroke-width="4">
    <path d="M 620 360 L 620 220 Q 650 160 680 220 L 680 360 Z" fill="#ef5350"/>
    <circle cx="650" cy="240" r="16" fill="#b3e5fc"/>
    <path d="M 620 320 l -28 50 h 28 Z M 680 320 l 28 50 h -28 Z" fill="#ffa726"/>
    <path d="M 638 362 q 12 30 24 0" fill="#ffee58" stroke-width="3"/>
  </g>`,
  asteroids: () => `<g fill="#b0bec5" stroke="#222" stroke-width="3.5">
    <ellipse cx="120" cy="120" rx="30" ry="24"/><ellipse cx="640" cy="190" rx="22" ry="18"/>
    <ellipse cx="540" cy="70" rx="26" ry="20"/>
  </g>`,
  moon: () => `<ellipse cx="400" cy="470" rx="420" ry="90" fill="#cfd8dc" stroke="#222" stroke-width="3"/>
    <ellipse cx="250" cy="415" rx="24" ry="8" fill="#90a4ae"/>
    <ellipse cx="560" cy="428" rx="30" ry="9" fill="#90a4ae"/>`,
  badge: () => `<g stroke="#222" stroke-width="3">
    <circle cx="385" cy="250" r="22" fill="#ffd54f"/>
    <path d="M 385 236 l 5 10 11 1 -8 8 2 11 -10 -6 -10 6 2 -11 -8 -8 11 -1 Z" fill="#ff7043" stroke-width="2"/>
  </g>`,
  medal: () => `<g stroke="#222" stroke-width="3">
    <path d="M 370 215 l 15 25 15 -25" fill="none" stroke="#1565c0" stroke-width="6"/>
    <circle cx="385" cy="252" r="20" fill="#ffd54f"/>
    <text x="385" y="259" text-anchor="middle" font-size="20">★</text>
  </g>`,
  map: () => `<g stroke="#222" stroke-width="3.5">
    <rect x="350" y="240" width="100" height="74" rx="6" fill="#fff8e1"/>
    <path d="M 362 296 Q 390 250 438 286" fill="none" stroke="#e53935" stroke-width="3" stroke-dasharray="7 6"/>
    <path d="M 432 280 l 10 6 -11 4 Z" fill="#e53935" stroke="none"/>
    <path d="M 372 258 l 4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1 Z" fill="#ffd54f" stroke-width="2"/>
  </g>`,
  jeep: () => `<g stroke="#222" stroke-width="4">
    <rect x="80" y="320" width="150" height="48" rx="10" fill="#fbc02d"/>
    <rect x="100" y="290" width="80" height="34" rx="8" fill="#fff9c4"/>
    <circle cx="115" cy="372" r="20" fill="#424242"/><circle cx="195" cy="372" r="20" fill="#424242"/>
    <circle cx="115" cy="372" r="8" fill="#bdbdbd"/><circle cx="195" cy="372" r="8" fill="#bdbdbd"/>
  </g>`,
  volcano: () => `<g stroke="#222" stroke-width="3.5">
    <path d="M 600 330 L 660 190 L 720 330 Z" fill="#8d6e63"/>
    <path d="M 642 196 h 36 l -8 18 h -22 Z" fill="#ef5350"/>
    <circle cx="660" cy="160" r="13" fill="none" stroke="#9e9e9e"/>
    <circle cx="678" cy="132" r="9" fill="none" stroke="#9e9e9e"/>
  </g>`,
  ferns: () => `<g fill="#66bb6a" stroke="#222" stroke-width="3">
    <path d="M 130 392 q -10 -55 14 -80 q 16 45 -2 80 Z"/>
    <path d="M 700 392 q -8 -45 12 -66 q 12 38 -2 66 Z"/>
  </g>`,
  lilypads: () => `<g fill="#43a047" stroke="#222" stroke-width="3">
    <ellipse cx="160" cy="400" rx="40" ry="12"/><ellipse cx="350" cy="408" rx="44" ry="13"/>
    <ellipse cx="540" cy="402" rx="40" ry="12"/>
  </g>`,
  bigbubble: () => `<circle cx="355" cy="270" r="125" fill="#b3e5fc" opacity="0.35" stroke="#4fc3f7" stroke-width="5"/>
    <path d="M 280 210 q 18 -28 50 -34" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.8"/>`,
  sub: () => `<g stroke="#222" stroke-width="4">
    <ellipse cx="610" cy="300" rx="95" ry="48" fill="#ffca28"/>
    <rect x="585" y="232" width="50" height="28" rx="8" fill="#ffca28"/>
    <circle cx="610" cy="226" r="8" fill="#ef5350"/>
    <circle cx="575" cy="300" r="14" fill="#b3e5fc"/><circle cx="630" cy="300" r="14" fill="#b3e5fc"/>
    <path d="M 700 285 l 30 -16 v 60 l -30 -16 Z" fill="#ffb300"/>
  </g>`,
  clam: () => `<g stroke="#222" stroke-width="4">
    <path d="M 320 392 Q 320 330 385 330 Q 450 330 450 392 Z" fill="#f48fb1"/>
    <path d="M 320 392 Q 385 372 450 392" fill="none"/>
    <circle cx="385" cy="320" r="22" fill="#e1f5fe" stroke-width="3.5"/>
    <circle cx="378" cy="313" r="6" fill="#fff"/>
  </g>`,
  confetti: () => {
    const cs = ["#ef5350", "#ffca28", "#66bb6a", "#42a5f5", "#ab47bc"];
    let out = "<g>";
    const pts = [[90,120],[170,80],[260,140],[360,70],[470,130],[560,90],[660,140],[730,100],[120,210],[680,210],[400,160],[300,100],[520,200]];
    pts.forEach(([cx, cy], i) => {
      out += `<rect x="${cx}" y="${cy}" width="11" height="11" rx="2" fill="${cs[i % 5]}" transform="rotate(${(i * 47) % 360} ${cx} ${cy})"/>`;
    });
    return out + "</g>";
  },
  locker: () => `<g stroke="#222" stroke-width="4">
    <rect x="620" y="180" width="90" height="190" rx="6" fill="#90caf9"/>
    <rect x="710" y="180" width="60" height="190" rx="4" fill="#64b5f6" transform="skewY(-4)"/>
    <path d="M 640 240 l 8 16 18 2 -13 12 3 18 -16 -9 -16 9 3 -18 -13 -12 18 -2 Z" fill="#ffee58" stroke-width="2.5"/>
  </g>`,
  magnet: () => `<g stroke="#222" stroke-width="4">
    <path d="M 90 300 v -50 a 45 45 0 0 1 90 0 v 50 h -28 v -50 a 17 17 0 0 0 -34 0 v 50 Z" fill="#e53935"/>
    <rect x="90" y="282" width="28" height="18" fill="#eceff1"/>
    <rect x="152" y="282" width="28" height="18" fill="#eceff1"/>
    <path d="M 100 310 l 6 10 M 135 314 l 0 12 M 170 310 l -6 10" stroke="#fbc02d" stroke-width="3"/>
  </g>`,
  banana: () => `<path d="M 620 380 Q 660 400 700 372 Q 668 392 628 372 Z" fill="#ffeb3b" stroke="#222" stroke-width="3.5"/>`,
  clouds: () => `<g fill="#fff" stroke="#222" stroke-width="3">
    <ellipse cx="150" cy="330" rx="70" ry="26"/><ellipse cx="640" cy="350" rx="80" ry="28"/>
    <ellipse cx="420" cy="395" rx="90" ry="30"/>
  </g>`
};

/* ---------- speech bubble ---------- */

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function speechBubble(scene, ctx) {
  if (!scene.bubble) return "";
  const c = scene.cast[scene.bubble.who];
  if (!c) return "";
  const text = ctx.fill ? ctx.fill(scene.bubble.text) : scene.bubble.text;
  const lines = wrapText(text, 18);
  const w = Math.max(...lines.map(l => l.length)) * 11.5 + 36;
  const h = lines.length * 26 + 24;
  const kindS = (KINDS[c.who] || KINDS.kid).s;
  const headTop = (c.y || 392) - 150 * kindS;
  let bx = c.x - w / 2;
  bx = Math.max(12, Math.min(800 - w - 12, bx));
  const by = Math.max(10, headTop - h - 18);
  const tailX = Math.max(bx + 24, Math.min(bx + w - 24, c.x));
  const tspans = lines.map((l, i) =>
    `<tspan x="${bx + w / 2}" y="${by + 30 + i * 26}">${esc(l)}</tspan>`).join("");
  return `
    <g>
      <rect x="${bx}" y="${by}" width="${w}" height="${h}" rx="16" fill="#fff" stroke="#222" stroke-width="4"/>
      <path d="M ${tailX - 12} ${by + h - 1} L ${tailX} ${by + h + 20} L ${tailX + 12} ${by + h - 1} Z"
            fill="#fff" stroke="#222" stroke-width="4" stroke-linejoin="round"/>
      <rect x="${tailX - 11}" y="${by + h - 4}" width="22" height="6" fill="#fff"/>
      <text class="bubbleText" text-anchor="middle">${tspans}</text>
    </g>`;
}

/* ---------- seasonal overlays (set by the practice dashboard) ---------- */

const SEASONS_ART = {
  winter() {
    let flakes = "<g fill='#fff' stroke='#b3e5fc' stroke-width='1'>";
    const pts = [[60,50],[170,110],[300,40],[430,100],[560,55],[690,115],[120,180],[640,190],[370,150],[740,60],[230,90],[500,170]];
    pts.forEach(([x, y], i) => { flakes += `<circle cx="${x}" cy="${y}" r="${4 + (i % 3)}"/>`; });
    flakes += "</g>";
    let drift = "<path d='M 0 0 L 800 0 L 800 12 ";
    for (let x = 800; x >= 0; x -= 60) drift += `Q ${x - 30} 30 ${x - 60} 12 `;
    drift += "Z' fill='#fff' opacity='0.9'/>";
    return flakes + drift;
  },
  halloween() {
    return `
      <g stroke="#222" stroke-width="3">
        <ellipse cx="60" cy="378" rx="26" ry="20" fill="#ff8f00"/>
        <rect x="55" y="352" width="10" height="10" rx="3" fill="#33691e"/>
        <path d="M 50 372 l 6 6 6 -6 M 64 372 l 6 6 6 -6" fill="none" stroke="#4e2600" stroke-width="2.5"/>
        <ellipse cx="748" cy="380" rx="22" ry="17" fill="#ff8f00"/>
        <rect x="744" y="358" width="8" height="9" rx="3" fill="#33691e"/>
      </g>
      <path d="M 360 60 q 14 -18 28 0 q 6 -10 14 -2 q 8 -8 14 2 q 14 -18 28 0 l -14 12 -28 -6 -28 6 Z"
            fill="#37474f"/>`;
  },
  spring() {
    let out = "<g stroke='#222' stroke-width='2.5'>";
    [[60, "#f06292"], [120, "#ba68c8"], [690, "#ffd54f"], [750, "#f06292"]].forEach(([x, color]) => {
      out += `<line x1="${x}" y1="392" x2="${x}" y2="362" stroke="#388e3c" stroke-width="4"/>
        ${[0, 72, 144, 216, 288].map(a =>
          `<ellipse cx="${x}" cy="354" rx="6" ry="9" fill="${color}" transform="rotate(${a} ${x} 362)"/>`).join("")}
        <circle cx="${x}" cy="362" r="5" fill="#fff59d"/>`;
    });
    return out + "</g>";
  },
  summer() {
    return `
      <g stroke="#222" stroke-width="3">
        <circle cx="744" cy="56" r="26" fill="#ffeb3b"/>
        ${[0, 45, 90, 135, 180, 225, 270, 315].map(a =>
          `<line x1="744" y1="18" x2="744" y2="8" stroke="#fbc02d" stroke-width="5" transform="rotate(${a} 744 56)"/>`).join("")}
      </g>
      <g stroke="#222" stroke-width="3">
        <circle cx="62" cy="372" r="20" fill="#fff"/>
        <path d="M 42 372 a 20 20 0 0 1 40 0 Z" fill="#ef5350"/>
        <line x1="42" y1="372" x2="82" y2="372"/>
      </g>`;
  }
};

/* ---------- main panel renderer ---------- */

function renderScene(scene, ctx) {
  const uid = ++_uid;
  const bg = (BGS[scene.bg] || BGS.party)(ctx);
  const props = (scene.props || []).map(p => (PROPS[p] ? PROPS[p](ctx) : "")).join("\n");
  const cast = (scene.cast || [])
    .map(c => HUMANOIDS.has(c.who) ? humanoid(c, ctx) : creature(c, ctx))
    .join("\n");
  return `
  <svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg" class="panelSvg" role="img">
    <defs>
      <pattern id="dots${uid}" width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.6" fill="#000" opacity="0.05"/>
      </pattern>
    </defs>
    ${bg}
    <rect width="800" height="450" fill="url(#dots${uid})"/>
    ${ctx.season && SEASONS_ART[ctx.season] ? SEASONS_ART[ctx.season]() : ""}
    ${props}
    ${cast}
    ${speechBubble(scene, ctx)}
    <rect x="3" y="3" width="794" height="444" fill="none" stroke="#222" stroke-width="6"/>
  </svg>`;
}
