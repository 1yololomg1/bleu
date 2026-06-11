/* ============================================================
   Select Your Destiny — App
   Flow: staff setup → kid start (theme + tier) → portraits
   (Star Edition) → comic adventure → ending → pay at counter
   → front-desk print of the whole adventure.
   ============================================================ */

const CONFIG_KEY = "syd_config_v1";

let config = loadConfig();
let session = null; // { kidName, adultName, themeId, tier, faces, path }
let camStream = null;
let camTarget = null;

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null; }
  catch { return null; }
}
function saveConfig(c) {
  config = c;
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); }
  catch (e) { alert("Could not save settings (photos/logo may be too large for this browser's storage). Try smaller images."); }
}

/* ---------- view switching ---------- */

function show(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
  window.scrollTo(0, 0);
}

/* ---------- text templating ---------- */

function fillText(text) {
  if (!text) return "";
  return text
    .replace(/\{kid\}/g, session && session.kidName ? session.kidName : "our hero")
    .replace(/\{adult\}/g, session && session.adultName ? session.adultName : "their grown-up")
    .replace(/\{doctor\}/g, config.doctorName || "the doctor")
    .replace(/\{practice\}/g, config.practice || "the doctor's office")
    .replace(/\{office\}/g, config.officeDesc || "");
}

function sceneCtx() {
  return {
    faces: {
      kid: session && session.tier === "star" ? session.faces.kid : null,
      adult: session && session.tier === "star" ? session.faces.adult : null,
      doctor: config.doctorPhoto || null
    },
    names: {
      kid: session ? session.kidName : "",
      adult: session ? session.adultName : "",
      doctor: config.doctorName || "",
      practice: config.practice || ""
    },
    logo: config.logo || null,
    themeColor: session ? THEMES[session.themeId].color : "#1565c0",
    fill: fillText
  };
}

/* ---------- image helpers ---------- */

function readImageFile(file, maxSide, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function squareCropFromVideo(video, side) {
  const s = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - s) / 2;
  const sy = (video.videoHeight - s) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  canvas.getContext("2d").drawImage(video, sx, sy, s, s, 0, 0, side, side);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/* ============================================================
   STAFF SETUP
   ============================================================ */

function openSetup() {
  const c = config || {};
  document.getElementById("setupPractice").value = c.practice || "";
  document.getElementById("setupDoctor").value = c.doctorName || "";
  document.getElementById("setupOffice").value = c.officeDesc || "";
  document.getElementById("setupDoctorDesc").value = c.doctorDesc || "";
  setPreview("setupDoctorPhotoPreview", c.doctorPhoto);
  setPreview("setupLogoPreview", c.logo);
  show("view-setup");
}

function setPreview(id, dataUrl) {
  const el = document.getElementById(id);
  el.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="">` : "<span>none yet</span>";
  el.dataset.value = dataUrl || "";
}

function saveSetup() {
  const practice = document.getElementById("setupPractice").value.trim();
  const doctorName = document.getElementById("setupDoctor").value.trim();
  if (!practice || !doctorName) {
    alert("Please fill in the practice name and the doctor's name.");
    return;
  }
  saveConfig({
    practice,
    doctorName,
    officeDesc: document.getElementById("setupOffice").value.trim(),
    doctorDesc: document.getElementById("setupDoctorDesc").value.trim(),
    doctorPhoto: document.getElementById("setupDoctorPhotoPreview").dataset.value || "",
    logo: document.getElementById("setupLogoPreview").dataset.value || ""
  });
  renderHome();
  show("view-home");
}

/* ============================================================
   KID START SCREEN
   ============================================================ */

function renderHome() {
  document.getElementById("homePractice").textContent = config.practice;
  const grid = document.getElementById("themeGrid");
  grid.innerHTML = "";
  for (const [id, t] of Object.entries(THEMES)) {
    const card = document.createElement("button");
    card.className = "themeCard";
    card.style.setProperty("--theme-color", t.color);
    card.innerHTML = `<span class="themeEmoji">${t.emoji}</span>
      <span class="themeName">${t.name}</span>
      <span class="themeTag">${t.tagline}</span>`;
    card.onclick = () => {
      document.querySelectorAll(".themeCard").forEach(c => c.classList.remove("picked"));
      card.classList.add("picked");
      grid.dataset.picked = id;
    };
    grid.appendChild(card);
  }
  delete grid.dataset.picked;
  document.querySelectorAll(".tierCard").forEach(c => c.classList.remove("picked"));
  document.getElementById("tierRow").dataset.picked = "";
  document.getElementById("kidName").value = "";
  document.getElementById("adultName").value = "";
}

function pickTier(el, tier) {
  document.querySelectorAll(".tierCard").forEach(c => c.classList.remove("picked"));
  el.classList.add("picked");
  document.getElementById("tierRow").dataset.picked = tier;
}

function startAdventure() {
  const kidName = document.getElementById("kidName").value.trim();
  const adultName = document.getElementById("adultName").value.trim();
  const themeId = document.getElementById("themeGrid").dataset.picked;
  const tier = document.getElementById("tierRow").dataset.picked;
  if (!kidName) { alert("What's the explorer's name?"); return; }
  if (!themeId) { alert("Pick an adventure theme first!"); return; }
  if (!tier) { alert("Choose Classic or Star Edition!"); return; }

  session = {
    kidName, adultName: adultName || "Grown-up",
    themeId, tier,
    faces: { kid: null, adult: null },
    path: [],
    doctorIntroDone: false
  };

  if (tier === "star") {
    renderPortraits();
    show("view-portraits");
  } else {
    beginStory();
  }
}

/* ============================================================
   PORTRAITS (Star Edition — kid AND adult required)
   ============================================================ */

function renderPortraits() {
  document.getElementById("portraitKidName").textContent = session.kidName;
  document.getElementById("portraitAdultName").textContent = session.adultName;
  updatePortrait("kid"); updatePortrait("adult");
}

function updatePortrait(who) {
  const el = document.getElementById(who === "kid" ? "portraitKid" : "portraitAdult");
  const face = session.faces[who];
  el.innerHTML = face ? `<img src="${face}" alt="">` : `<span>📷</span>`;
  el.classList.toggle("done", !!face);
  document.getElementById("portraitsGo").disabled = !(session.faces.kid && session.faces.adult);
}

function portraitFile(who, input) {
  if (!input.files || !input.files[0]) return;
  readImageFile(input.files[0], 400, dataUrl => {
    session.faces[who] = dataUrl;
    updatePortrait(who);
  });
  input.value = "";
}

async function openCamera(who) {
  camTarget = who;
  const modal = document.getElementById("camModal");
  const video = document.getElementById("camVideo");
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    video.srcObject = camStream;
    modal.classList.add("open");
  } catch (e) {
    alert("Camera not available — use the Upload button instead!");
  }
}

function snapPhoto() {
  const video = document.getElementById("camVideo");
  session.faces[camTarget] = squareCropFromVideo(video, 400);
  closeCamera();
  updatePortrait(camTarget);
}

function closeCamera() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  document.getElementById("camModal").classList.remove("open");
}

/* ============================================================
   STORY ENGINE
   ============================================================ */

function theme() { return THEMES[session.themeId]; }

function beginStory() {
  session.path = [];
  session.doctorIntroDone = false;
  goToNode(theme().start);
  show("view-story");
}

function nodeCaption(node) {
  let text = fillText(node.text);
  // First time the doctor walks into the story without a photo,
  // weave in the staff-written description of them.
  const docInScene = (node.scene.cast || []).some(c => c.who === "doctor");
  if (docInScene && !session.doctorIntroDone) {
    session.doctorIntroDone = true;
    if (!config.doctorPhoto && config.doctorDesc) {
      text += " You'd know " + fillText("{doctor}") + " anywhere — " + config.doctorDesc;
    }
  }
  return text;
}

function goToNode(nodeId) {
  const node = theme().nodes[nodeId];
  const caption = nodeCaption(node);
  session.path.push({ id: nodeId, caption });

  document.getElementById("storyTheme").textContent = `${theme().emoji} ${theme().name}`;
  document.getElementById("storyPanelNum").textContent = `Panel ${session.path.length}`;
  document.getElementById("storyPanel").innerHTML =
    renderScene({ ...node.scene, bubble: node.bubble }, sceneCtx());
  document.getElementById("storyCaption").textContent = caption;

  const choiceBox = document.getElementById("storyChoices");
  choiceBox.innerHTML = "";
  if (node.ending) {
    const endBanner = document.createElement("div");
    endBanner.className = "endBanner";
    endBanner.textContent = "🌟 THE END 🌟";
    choiceBox.appendChild(endBanner);
    const btn = document.createElement("button");
    btn.className = "bigBtn";
    btn.textContent = "Finish my adventure!";
    btn.onclick = () => finishStory(node);
    choiceBox.appendChild(btn);
  } else {
    node.choices.forEach(ch => {
      const btn = document.createElement("button");
      btn.className = "choiceBtn";
      btn.textContent = fillText(ch.label);
      btn.onclick = () => goToNode(ch.to);
      choiceBox.appendChild(btn);
    });
  }
}

/* ============================================================
   ENDING + PAYMENT + PRINT
   ============================================================ */

function finishStory(endNode) {
  session.endTitle = endNode.title || "The End";
  document.getElementById("endTitle").textContent = session.endTitle;
  document.getElementById("endKid").textContent = session.kidName;
  document.getElementById("endPanels").textContent = session.path.length;

  const isStar = session.tier === "star";
  document.getElementById("endStar").style.display = isStar ? "" : "none";
  document.getElementById("endClassic").style.display = isStar ? "none" : "";
  show("view-ending");
}

function frontDeskPrint() {
  buildPrintout();
  window.print();
}

function buildPrintout() {
  const t = theme();
  const ctx = sceneCtx();
  const area = document.getElementById("printArea");
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const logoImg = config.logo ? `<img class="printLogo" src="${config.logo}" alt="">` : "";
  let html = `
    <div class="printTitlePage">
      ${logoImg}
      <div class="printPractice">${escHtml(config.practice)}</div>
      <h1>${t.emoji} ${escHtml(fillText(session.endTitle ? t.name : t.name))}</h1>
      <h2>"${escHtml(session.endTitle || "The Adventure")}"</h2>
      <p class="printStarring">Starring <strong>${escHtml(session.kidName)}</strong>
        ${session.tier === "star" ? `&amp; <strong>${escHtml(session.adultName)}</strong>` : ""}
        — with ${escHtml(config.doctorName)}</p>
      <p class="printDate">${today}</p>
      ${session.tier === "star" ? `<div class="printPaid">⭐ STAR EDITION — PAID $10 ⭐</div>` : ""}
    </div>
    <div class="printGrid">`;

  session.path.forEach((step, i) => {
    const node = t.nodes[step.id];
    html += `
      <div class="printPanel">
        <div class="printPanelNum">${i + 1}</div>
        ${renderScene({ ...node.scene, bubble: node.bubble }, ctx)}
        <p class="printCaption">${escHtml(step.caption)}</p>
      </div>`;
  });

  html += `</div>
    <div class="printFooter">
      Created at ${escHtml(config.practice)} • Come back for a brand-new destiny next visit! ${t.emoji}
    </div>`;
  area.innerHTML = html;
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : s;
  return d.innerHTML;
}

function newAdventure() {
  session = null;
  document.getElementById("printArea").innerHTML = "";
  renderHome();
  show("view-home");
}

/* ---------- boot ---------- */

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("setupDoctorPhotoFile").addEventListener("change", function () {
    if (this.files && this.files[0]) readImageFile(this.files[0], 400, d => setPreview("setupDoctorPhotoPreview", d));
    this.value = "";
  });
  document.getElementById("setupLogoFile").addEventListener("change", function () {
    if (this.files && this.files[0]) readImageFile(this.files[0], 300, d => setPreview("setupLogoPreview", d));
    this.value = "";
  });

  if (!config) {
    openSetup();
  } else {
    renderHome();
    show("view-home");
  }
});
