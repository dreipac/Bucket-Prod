// ===== Helpers =====

// Supabase Init 
const { url: SB_URL, anonKey: SB_ANON } = window.__SUPABASE || {};
if (!SB_URL || !SB_ANON) {
  console.error("Supabase-Konfiguration fehlt. Bitte window.__SUPABASE setzen.");
}
const supabase = window.supabase?.createClient(SB_URL, SB_ANON);

// Session-Cache
let _auth = { user: null };

async function getSessionUser() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  _auth.user = user || null;
  return _auth.user;
}


function q(sel, root=document){ return root.querySelector(sel); }
function loadJSON(key){ try{ return JSON.parse(localStorage.getItem(key)); }catch{ return null; } }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function isNum(n){ return typeof n === "number" && !isNaN(n); }
function setCSS(name,val){ document.documentElement.style.setProperty(name, val); }
const uid = () => Math.random().toString(36).slice(2, 10);
const backupBtn    = q("#backupBtn");
const restoreInput = q("#restoreInput");
const ARCHIVE_NAME = "Archiv";

function isArchiveList(list){ return list && list.name === ARCHIVE_NAME; }

function getArchiveList(){
  return state.lists.find(l => l.name === ARCHIVE_NAME) || null;
}
function ensureArchiveList(){
  let a = getArchiveList();
  if (!a){
    a = { id: uid(), name: ARCHIVE_NAME, items: [] };
    state.lists.push(a);
    saveState();
    renderLists(); // neu sichtbar machen
  }
  return a;
}

// Konfetti erzeugen
function spawnConfetti(li, count = 14){
  const palette = ["var(--accent)", "var(--accent-2)", "#ffd33d", "#2ecc71", "#ff6b6b"];
  const box = document.createElement("div");
  box.className = "confetti";
  li.appendChild(box);

  for (let i=0; i<count; i++){
    const p = document.createElement("i");
    // zufällige Richtungen
    const angle = Math.random() * Math.PI * 2;
    const dist  = 60 + Math.random()*80; // 60–140px
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = (Math.random()*720 - 360) + "deg";
    p.style.setProperty("--tx", tx.toFixed(1) + "px");
    p.style.setProperty("--ty", ty.toFixed(1) + "px");
    p.style.setProperty("--rot", rot);
    p.style.background = palette[i % palette.length];
    p.style.animationDelay = (Math.random()*120|0) + "ms";
    box.appendChild(p);
  }

  // nach ~1s aufräumen
  setTimeout(()=> box.remove(), 1000);
}

// ===== Green Comet → Archiv + Impact Burst =====
function getArchiveButtonEl(){
  // im Sidebar-Navi den Button mit Text "Archiv" finden
  const btns = listsNav ? listsNav.querySelectorAll('.list-row .list-btn') : [];
  for (const b of btns){
    if (b.textContent.trim() === ARCHIVE_NAME) return b;
  }
  return null;
}

function screenBurstAt(x, y, count = 60){
  const root = document.createElement('div');
  root.className = 'fx-burst';
  const emitter = document.createElement('div');
  emitter.className = 'emitter';
  emitter.style.setProperty('--x', x + 'px');
  emitter.style.setProperty('--y', y + 'px');
  root.appendChild(emitter);

  for (let i=0; i<count; i++){
    const p = document.createElement('i');
    // weite Streuung über den Bildschirm
    const angle = Math.random() * Math.PI * 2;
    const dist  = 200 + Math.random() * 600; // 200–800px
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = (Math.random()*720 - 360) + "deg";
    p.style.setProperty('--tx', tx.toFixed(1) + 'px');
    p.style.setProperty('--ty', ty.toFixed(1) + 'px');
    p.style.setProperty('--rot', rot);
    // leichte Verzögerung für organischen Look
    p.style.animationDelay = (Math.random()*80|0) + 'ms';
    emitter.appendChild(p);
  }

  document.body.appendChild(root);
  // nach Ende aufräumen
  setTimeout(()=> root.remove(), 900);
}

function flyCometToArchive(fromEl){
  try{
    const startRect = fromEl.getBoundingClientRect();
    let archBtn = getArchiveButtonEl();

    // Falls Archiv-Liste noch nicht existiert → erstellen & Listen rendern, damit Ziel existiert
    if (!archBtn){
      ensureArchiveList(); // existiert bereits in deinem Code
      renderLists();       // nur Listen, nicht komplette Items notwendig
      archBtn = getArchiveButtonEl();
    }

    if (!archBtn){
      // Fallback: zur Sidebar-Ecke fliegen
      const fallbackX = 20, fallbackY = 120;
      const sx = startRect.left + startRect.width/2;
      const sy = startRect.top  + startRect.height/2;
      const comet = document.createElement('div');
      comet.className = 'fx-comet';
      comet.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      document.body.appendChild(comet);
      requestAnimationFrame(()=>{
        comet.style.transform = `translate3d(${fallbackX}px, ${fallbackY}px, 0)`;
      });
      comet.addEventListener('transitionend', ()=>{
        const x = fallbackX, y = fallbackY;
        comet.remove();
        screenBurstAt(x, y);
      }, { once:true });
      return;
    }

    const targetRect = archBtn.getBoundingClientRect();
    const tx = targetRect.left + targetRect.width  * 0.5;
    const ty = targetRect.top  + targetRect.height * 0.5;

    const sx = startRect.left + startRect.width/2;
    const sy = startRect.top  + startRect.height/2;

    // Komet erstellen
    const comet = document.createElement('div');
    comet.className = 'fx-comet';
    // Startposition
    comet.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
    document.body.appendChild(comet);

    // Nächster Frame → zum Ziel fliegen
    requestAnimationFrame(()=>{
      // optional: Schweif grob ausrichten (nur für Optik, kein Muss)
      const dx = tx - sx, dy = ty - sy;
      const angle = Math.atan2(dy, dx) * 180/Math.PI;
      comet.style.rotate = angle + 'deg';
      comet.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    });

    comet.addEventListener('transitionend', ()=>{
      const x = tx, y = ty;
      comet.remove();
      // Impact-Burst auslösen
      screenBurstAt(x, y);
    }, { once:true });

  } catch(e){
    // failsafe – nie hart crashen
    console.warn('Comet animation failed:', e);
  }
}


// ===== Storage =====
const STORAGE_KEY = "bucketData_v5";
const PREFS_KEY  = "bucketPrefs_v2";

const prev =
  loadJSON(STORAGE_KEY) ||
  loadJSON("bucketData_v4") ||
  loadJSON("bucketData_v3") ||
  loadJSON("bucketData_v2") ||
  loadJSON("bucketData_v1");

async function saveState(){
  try{
    // Lokaler Cache als Offline-Fallback
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const user = await getSessionUser();
    if (!user || !supabase) return; // nicht eingeloggt → nur lokal

    const payload = {
      user_id: user.id,
      data: { ...state }
    };

    // Ein Datensatz pro User (erfordert Unique-Index auf user_id, siehe Hinweis unten)
    const { error } = await supabase
      .from("bucket_states")
      .upsert(payload, { onConflict: "user_id" });

    if (error) throw error;
  } catch(err){
    console.warn("saveState remote failed:", err);
  }
}

function savePrefs(){
  const base = loadJSON(PREFS_KEY) || {};
  // sanft mergen, damit fremde Keys (z. B. nbSideW aus dem Notizbuch) erhalten bleiben
  const mergedUI = { ...(base.ui || {}), ...(prefs.ui || {}) };
  const merged   = { ...base, ...prefs, ui: mergedUI };
  localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
}


function normalizeState(raw){
  const src = (raw && typeof raw === "object") ? raw : {};
  let lists = Array.isArray(src.lists) ? src.lists : [];
  lists = lists.map(l => ({
  id: String(l.id || uid()),
  name: String(l.name || "Liste"),
  // NEU: optionales Icon pro Liste (Pfad/Dateiname)
  icon: (typeof l.icon === "string" && l.icon.trim()) ? l.icon : null,
  items: Array.isArray(l.items) ? l.items.map(it => ({
  id: String(it.id || uid()),
  title: String(it.title || it.text || ""),
  notes: String(it.notes || ""),
  done: !!it.done,
  dueDate: it.dueDate || "",
  dueTime: it.dueTime || "",
  priority: (["low","med","high"].includes(it.priority)) ? it.priority : "med",
  createdAt: Number(it.createdAt || Date.now()),
  repeat: (["none","daily","weekly","monthly"].includes(it.repeat)) ? it.repeat : "none",
  repeatEnd: (["never","after","until"].includes(it.repeatEnd)) ? it.repeatEnd : "never",
  repeatCount: (typeof it.repeatCount === "number" && it.repeatCount > 0) ? it.repeatCount : null,
  repeatUntil: it.repeatUntil || "",
  repeatLeft: (typeof it.repeatLeft === "number" && it.repeatLeft >= 0)
    ? it.repeatLeft
    : ((it.repeatEnd === "after" && typeof it.repeatCount === "number") ? it.repeatCount : null),

  // NEU: Unteraufgaben (robust normalisieren)
  subtasks: Array.isArray(it.subtasks)
    ? it.subtasks.map(st => ({
        id: String(st.id || uid()),
        text: String(st.text || ""),
        done: !!st.done
      }))
    : []
})) : []
}));

  let selectedListId = lists.some(l => l.id === src.selectedListId)
    ? src.selectedListId
    : (lists[0]?.id || null);
  return { lists, selectedListId };
}

async function loadStateFromRemote(){
  try{
    const user = await getSessionUser();

    // Nicht eingeloggt → lokalen Cache verwenden
    if (!user || !supabase){
      const local = loadJSON(STORAGE_KEY);
      const normalized = normalizeState(local || prev || { lists:[], selectedListId:null });
      state.lists = normalized.lists;
      state.selectedListId = normalized.selectedListId;
      return;
    }

    // Remote lesen
    const { data, error } = await supabase
      .from("bucket_states")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const remoteData = data?.data || null;
    const base = remoteData || loadJSON(STORAGE_KEY) || { lists:[], selectedListId:null };
    const normalized = normalizeState(base);

    state.lists = normalized.lists;
    state.selectedListId = normalized.selectedListId;

    // Archiv-Liste sicherstellen (deine vorhandene Funktion)
    ensureArchiveList();

    // Direkt persistieren (async), damit der Datensatz existiert
    saveState();

  } catch(err){
    console.warn("loadStateFromRemote failed:", err);
    // Fallback: Lokal
    const local = loadJSON(STORAGE_KEY);
    const normalized = normalizeState(local || prev || { lists:[], selectedListId:null });
    state.lists = normalized.lists;
    state.selectedListId = normalized.selectedListId;
  }
}


const state = normalizeState(prev || { lists: [], selectedListId: null });

// ===== Preferences (Theme + Opacity + Mode) =====
const THEME_MAP = {
  blue:   { accent:"#22b0ff", accent2:"#7c4dff" },
  pink:   { accent:"#ff7ab8", accent2:"#ff4d97" },
  yellow: { accent:"#ffd33d", accent2:"#ffb302" },
  red:    { accent:"#ff6b6b", accent2:"#ff3b3b" },
  green:  { accent:"#2ecc71", accent2:"#00c853" },
  teal:   { accent:"#2ad4c9", accent2:"#00bfa5" },
  orange: { accent:"#ff9f43", accent2:"#ff7f11" },
  violet:  { accent:"#8b5cf6", accent2:"#7c3aed" }, // Violett
  indigo:  { accent:"#6366f1", accent2:"#4338ca" }, // Indigoblau
  lavender:{ accent:"#c4b5fd", accent2:"#a78bfa" }, // Pastell-Lila
  mint:    { accent:"#10b981", accent2:"#34d399" }, // Mint/Emerald
  lime:    { accent:"#84cc16", accent2:"#22c55e" }, // Limette/Grün
  amber:   { accent:"#f59e0b", accent2:"#fbbf24" }, // Amber
  copper:  { accent:"#b45309", accent2:"#f59e0b" }, // Kupfer
  coral:   { accent:"#fb7185", accent2:"#f43f5e" }, // Koralle
  fuchsia: { accent:"#d946ef", accent2:"#a21caf" }, // Fuchsia
  ocean:   { accent:"#06b6d4", accent2:"#3b82f6" }, // Türkis–Blau (Ocean)
  forest:  { accent:"#16a34a", accent2:"#065f46" }, // Waldgrün
  slate:   { accent:"#64748b", accent2:"#94a3b8" }, // Schiefer (neutral)
};

const stored = loadJSON(PREFS_KEY) || {};
const prefs = {
  theme: THEME_MAP[stored.theme] ? stored.theme : "blue",
  nbOpen: (stored.ui?.nbOpen === "new") ? "new" : "same",
  glassAlphaStrong: isNum(stored.glassAlphaStrong) ? clamp(stored.glassAlphaStrong, .3, .95) : 0.75,
  cardAlpha: isNum(stored.cardAlpha) ? clamp(stored.cardAlpha, .3, .98) : 0.82,
  mode: (["light","dark","galaxy"].includes(stored.mode) ? stored.mode : "dark"),
  bg: (["zurich","geneva","zug","prizren","chur","luzern","lugano"].includes(stored.bg) ? stored.bg : "zurich"),
  appTitle: (typeof stored.appTitle === "string" && stored.appTitle.trim())
    ? stored.appTitle.trim()
    : "Bucket Liste",
  ui: {
    cardScale:  isNum(stored.ui?.cardScale)  ? clamp(stored.ui.cardScale, 0.85, 1.35) : 1,
    sideW:      isNum(stored.ui?.sideW)      ? clamp(stored.ui.sideW,     220, 520)   : 280,
    pressSpeed: isNum(stored.ui?.pressSpeed) ? clamp(stored.ui.pressSpeed, 0.5, 2.0)  : 1,
    listCreateMode: (stored.ui?.listCreateMode === "instant") ? "instant" : "modal"
  }
};
// --- Profildaten im Prefs-Objekt bereitstellen ---
prefs.profile = {
  first: (stored.profile?.first || "").trim(),
  last:  (stored.profile?.last  || "").trim(),
  org:   (stored.profile?.org   || "").trim(),
  avatar: stored.profile?.avatar || null  // Data-URL (Bild) oder null
};




/* ===== Sidebar Open/Close with Persist (NEW) ===== */
function isSidebarCollapsed(){
  try{
    const p = loadJSON(PREFS_KEY) || {};
    return !!(p.ui && p.ui.sideCollapsed);
  }catch{ return false; }
}
function setSidebarCollapsed(collapsed){
  const el = document.getElementById("sidebar");

  // Persistenz: prefs benutzen (saveJSON gibt es NICHT!)
  prefs.ui = prefs.ui || {};
  prefs.ui.sideCollapsed = !!collapsed;
  savePrefs();

  if (!el){
    // Fallback: nur Klasse am Body setzen
    document.body.classList.toggle("sidebar-collapsed", !!collapsed);
    return;
  }

  if (!collapsed){
    // Aufklappen: zuerst sichtbar, dann Klasse entfernen → animiert Breite auf
    el.style.display = "block";
    requestAnimationFrame(() => {
      document.body.classList.remove("sidebar-collapsed");
    });
    return;
  }

  // Zuklappen: sichtbar lassen, Klasse setzen → animiert Breite zu
  el.style.display = "block";
  requestAnimationFrame(() => {
    document.body.classList.add("sidebar-collapsed");
  });

  // NACH der Transition: display:none setzen
  const onEnd = (ev) => {
    if (ev.target !== el) return;
    if (ev.propertyName !== "width") return; // wir hören auf die Breiten-Transition
    el.style.display = "none";
    el.removeEventListener("transitionend", onEnd);
  };
  el.addEventListener("transitionend", onEnd, { once: true });
}



function openSidebar(){
  setSidebarCollapsed(false);
}
function closeSidebar(){
  setSidebarCollapsed(true);
}
function toggleSidebar(){
  setSidebarCollapsed(!isSidebarCollapsed());
}

/* Initialisiert den Menü-Button & wendet gespeicherten Zustand an */
/* Initialisiert den Menü-Button & wendet gespeicherten Zustand an */
/* Initialisiert den Menü-Button & wendet gespeicherten Zustand an */
function initSidebarToggle(){
  const el = document.getElementById("sidebar");
  const menuBtn = document.getElementById("menuBtn");
  const collapsed = isSidebarCollapsed();

  // Startzustand: Klasse + Display
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  if (el) el.style.display = collapsed ? "none" : "block";
}

// Klick außerhalb: Sidebar weich zuklappen
document.addEventListener("click", (e) => {
  // schon zu? -> nichts tun
  if (isSidebarCollapsed()) return;

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const t = e.target;
  // wenn Klick in der Sidebar war -> nichts tun
  if (sidebar.contains(t)) return;
  // bestimmte Bereiche ignorieren
  if (t.closest("#sidebarResizer")) return;   // beim Resizer-Klick
  if (t.closest("#drawer")) return;           // Drawer/Backdrop
  if (t.closest("#menuBtn")) return;          // Menü-Button

  // jetzt sauber animiert schließen
  setSidebarCollapsed(true);
});



function applyPrefs(){
  const t = THEME_MAP[prefs.theme] || THEME_MAP.blue;
  setCSS("--accent", t.accent);
  setCSS("--accent-2", t.accent2);
  // Galaxy: fixen Akzent unabhängig von THEME_MAP
if (prefs.mode === "galaxy"){
  setCSS("--accent", "#0EA5FF");
  setCSS("--accent-2", "#60A5FA");
}

// Press-Animation-Dauer aus Speed-Faktor berechnen (1.0 = 220ms)
const base = 220; // ms
const speed = clamp(prefs.ui?.pressSpeed ?? 1, 0.5, 2);
const dur = Math.round(base / speed);
setCSS("--press-dur", dur + "ms");

// Settings-Slider initialisieren
if (pressSpeedRange) pressSpeedRange.value = String(speed);
if (pressSpeedRange) applyRangeFill(pressSpeedRange);
if (pressSpeedValue) pressSpeedValue.textContent = speed.toFixed(2) + "×";


  const strong = prefs.glassAlphaStrong;
  const content = clamp(strong - 0.17, 0.20, 0.95);
  setCSS("--glass-strong-alpha", strong);
  setCSS("--glass-alpha", content);
  setCSS("--card-alpha", prefs.cardAlpha);
  setCSS("--sidebar-w", (prefs.ui?.sideW || 280) + "px");
  setCSS("--card-scale", prefs.ui?.cardScale || 1);
  setCSS("--bg-url", `url("background/${prefs.bg}.png")`);



  document.documentElement.setAttribute("data-theme", prefs.mode);

  // Galaxy-Animation je nach Modus starten/stoppen
if (prefs.mode === "galaxy") {
  startGalaxy();
} else {
  stopGalaxy();
}

// Button-Press-Speed
if (pressSpeedRange && !pressSpeedRange._wired){
  pressSpeedRange.addEventListener("input", () => {
    const v = parseFloat(pressSpeedRange.value);
    prefs.ui.pressSpeed = clamp(isNaN(v) ? 1 : v, 0.5, 2);
    if (pressSpeedValue) pressSpeedValue.textContent = prefs.ui.pressSpeed.toFixed(2) + "×";
    savePrefs();
    applyPrefs(); // setzt --press-dur live
  });
  pressSpeedRange._wired = true;
}



  if (q("#opacityRange")) q("#opacityRange").value = String(strong.toFixed(2));
  if (q("#opacityValue")) q("#opacityValue").textContent = strong.toFixed(2);
  if (q("#cardOpacityRange")) q("#cardOpacityRange").value = String(prefs.cardAlpha.toFixed(2));
  if (q("#cardOpacityValue")) q("#cardOpacityValue").textContent = prefs.cardAlpha.toFixed(2);
  if (q("#bgSelect")) q("#bgSelect").value = prefs.bg;
  markActiveTheme(prefs.theme);
  markActiveMode(prefs.mode);
  markListCreateMode();
  markNotebookOpenMode();
  setAppTitleUI();

}

// ===== Elements =====
const profileBadge      = q("#profileBadge");
const profileText       = q("#profileText");
const profileAvatar     = q("#profileAvatar");
const profileModal      = q("#profileModal");
const profileForm       = q("#profileForm");
const profileFirst      = q("#profileFirst");
const profileLast       = q("#profileLast");
const profileOrg        = q("#profileOrg");
const profileImageInput = q("#profileImageInput");
const profilePreview    = q("#profilePreview");
const openProfileBtn    = q("#openProfile");
const profileCancel     = q("#profileCancel");
function refreshFloatingListField(){ setupFloatingField(listCreateName); }



// --- Settings: Menü/Views ---
const settingsBackBtn = q("#settingsBackBtn");
const settingsHeader  = q("#settingsHeader");
const settingsMenu    = q("#settingsMenu");
const settingsDesign  = q("#settingsDesign");
const settingsMisc    = q("#settingsMisc");
const openDesignBtn   = q("#openDesign");
const openMiscBtn     = q("#openMisc");
const settingsVersion = q("#settingsVersion");       
const openVersionBtn  = q("#openVersion");           


let _settingsView = "menu"; // "menu" | "design" | "misc"
/* --- SETTINGS: Initialzustand & Aufräumen --- */

// 1) Back-Button standardmäßig verstecken (Startansicht ist "menu")
if (settingsBackBtn) settingsBackBtn.hidden = true;

// 2) Unnötige/defekte Regler für Opacity/Kartentransparenz komplett entfernen
(() => {
  const killField = (sel) => {
    const el = q(sel);
    if (!el) return;
    const field = el.closest(".field");
    if (field) field.remove(); else el.remove();
  };
  // Slider + Anzeigen entfernen
  ["#opacityRange","#opacityValue","#cardOpacityRange","#cardOpacityValue"]
    .forEach(killField);
})();


// === Floating-Label Helpers (Profil) ===
function setupFloatingField(el){
  if (!el) return;
  const wrap = el.closest(".ff");
  if (!wrap) return;
  const sync = () => wrap.classList.toggle("has-value", !!el.value.trim());
  // beim Tippen / Verlassen Wert prüfen
  el.addEventListener("input", sync);
  el.addEventListener("blur", sync);
  // Initialzustand
  sync();
}

function refreshFloatingProfileFields(){
  setupFloatingField(profileFirst);
  setupFloatingField(profileLast);
  setupFloatingField(profileOrg);
}

// Beim initialen Laden einmal probieren (falls Modal schon im DOM ist)
refreshFloatingProfileFields();

// Temporärer Speicher für Bild (Data-URL), initial aus prefs
let _profileAvatarData  = prefs.profile?.avatar || null;

const listNameInput = q("#listNameInput");
const addListBtn = q("#addListBtn");
const listsNav = q("#lists");

const addItemBtn = q("#addItemBtn");
const itemsUl = q("#items");
const emptyText = q("#emptyText");

const listButtonTpl = q("#listButtonTpl");
const itemTpl = q("#itemTpl");

// Press-Pop beim Klick: kleiner -> loslassen -> Bounce
function enablePressPop(el){
  if (!el || el._pressPop) return;
  el.addEventListener("click", () => {
    el.classList.remove("pop"); // reset, falls noch dran
    // Kurz warten, damit :active (scale .965) sichtbar war, dann Bounce
    setTimeout(() => {
      el.classList.add("pop");
      el.addEventListener("animationend", () => el.classList.remove("pop"), { once:true });
    }, 10);
  });
  el._pressPop = true;
}
enablePressPop(addListBtn);
enablePressPop(addItemBtn);


// Suche & Filter
const searchInput  = q("#searchInput");
const statusFilter = q("#statusFilter");  // all | open | done
const dueFilter    = q("#dueFilter");     // all | today | overdue
const prioFilter   = q("#prioFilter");    // all | low | med | high
const sortBy      = q("#sortBy");  // Sortierung: due | status | prio | title

const appTitleEl    = q(".topbar h1");
const appTitleInput = q("#appTitleInput");

// Modals
const modal = q("#itemModal");
const itemForm = q("#itemForm");
const fTitle = q("#fTitle");
const fDate  = q("#fDate");
const fTime  = q("#fTime");
const fNotes = q("#fNotes");
const cancelBtn = q("#cancelBtn");
const modalTitle = q("#modalTitle");
const saveItemBtn = q("#saveItemBtn");
const prioSegment = q("#prioSegment");
const backgroundModal   = q("#backgroundModal");
const backgroundForm    = q("#backgroundForm");
const backgroundApply   = q("#backgroundApply");
const backgroundCancel  = q("#backgroundCancel");

// 🔁 NEU – robustes Umschalten von Einstellungen → Konto
const openAccountFromSettings = document.getElementById('openAccount');
if (openAccountFromSettings && !openAccountFromSettings._wired) {
  openAccountFromSettings._wired = true;
  openAccountFromSettings.addEventListener('click', () => {
    // Falls das Settings-Modal gar nicht offen ist: direkt Konto auf
    if (!settingsModal || !settingsModal.classList.contains('open')) {
      openProfileModal(true);
      return;
    }

    // Sauber schließen (mit deiner bestehenden Animation / Cleanup)
    closeModal(settingsModal);

    // Stark vereinfachter Handoff:
    // 1 Frame warten (DOM/Styles committed) + minimale Pufferzeit,
    // dann Konto-Modal öffnen. Keine Klassentricks, kein „Hard-Reset“.
    requestAnimationFrame(() => {
      setTimeout(() => {
        openProfileModal(true);
      }, 40);
    });
  });
}




// Repeat-Felder
const fRepeat      = q("#fRepeat");
const fRepeatEnd   = q("#fRepeatEnd");
const fRepeatCount = q("#fRepeatCount");
const fRepeatUntil = q("#fRepeatUntil");

// Sichtbarkeit/Disable je nach Auswahl
function updateRepeatUI(){
  const hasRepeat = fRepeat?.value !== "none";
  if (fRepeatEnd) fRepeatEnd.disabled = !hasRepeat;

  if (!hasRepeat){
    if (fRepeatCount) fRepeatCount.style.display = "none";
    if (fRepeatUntil) fRepeatUntil.style.display = "none";
    return;
  }
  const end = fRepeatEnd?.value || "never";
  if (fRepeatCount) fRepeatCount.style.display = (end === "after") ? "" : "none";
  if (fRepeatUntil) fRepeatUntil.style.display = (end === "until") ? "" : "none";
}

[fRepeat, fRepeatEnd]?.forEach(el => el?.addEventListener("change", updateRepeatUI));


// Drawer + Settings
const drawer = q("#drawer");
const menuBtn = q("#menuBtn");
const openSettingsBtn = q("#openSettings");     // im Drawer
const openSettingsTop = q("#openSettingsTop");  // in der Topbar
const settingsModal = q("#settingsModal");
const settingsForm = q("#settingsForm");
const settingsCancel = q("#settingsCancel");
const opacityRange = q("#opacityRange");
const opacityValue = q("#opacityValue");
const cardOpacityRange = q("#cardOpacityRange");
const cardOpacityValue = q("#cardOpacityValue");
const themeGrid = q("#themeGrid");
const modeSegment = q("#modeSegment");
const galaxyCanvas = document.getElementById("galaxyCanvas");
// Layout-Regler (Settings)
const cardScaleRange = q("#cardScaleRange");
const cardScaleValue = q("#cardScaleValue");
const bgSelect = q("#bgSelect");
const sideWidthRange = q("#sideWidthRange");
const sideWidthValue = q("#sideWidthValue");
const pressSpeedRange = q("#pressSpeedRange");
const pressSpeedValue = q("#pressSpeedValue");
[cardScaleRange, sideWidthRange, pressSpeedRange].forEach(wireRangeFill);

// ===== Auth Elements + Wiring =====
const logoutBtn = document.getElementById("logoutBtn");

// Abmelden
if (logoutBtn && !logoutBtn._wired){
  logoutBtn._wired = true;
  logoutBtn.addEventListener("click", async ()=>{
    try {
      await supabase.auth.signOut();
      // Nach SignOut zurück zur Login-Seite
      window.location.href = "login.html";
    } catch (err){
      console.error(err);
    }
  });
}

// Auth-Status → UI (Logout-Button / Profil-Badge)
async function refreshAuthUI(){
  const user = await getSessionUser();
  const loggedIn = !!user;
  if (logoutBtn) logoutBtn.style.display = loggedIn ? "" : "none";

  // Wenn kein Profilname gesetzt ist, zeige E-Mail im Badge
  if (profileBadge && profileText){
    if (loggedIn && (!prefs.profile?.first || !prefs.profile?.last)){
      profileText.textContent = user?.email || "Angemeldet";
      profileBadge.hidden = false;
    } else {
      renderProfileBadge();
    }
  }
}

// Wenn sich der Auth-Status ändert → UI + State neu laden
if (supabase){
  supabase.auth.onAuthStateChange(async (_event, _session) => {
    await refreshAuthUI();
    await loadStateFromRemote();
    render();
  });
}


// === THEME SWATCHES RENDERER (fügt die Farbschema-Kacheln in #themeGrid ein) ===
function buildThemeGrid(){
  if (!themeGrid) return;
  themeGrid.innerHTML = "";

  // In der Reihenfolge von THEME_MAP rendern
  Object.keys(THEME_MAP).forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-swatch pressable";
    btn.dataset.theme = key;

    // Dot + Label (Dot-Gradient wird bei markActiveTheme nochmal gesetzt)
    btn.innerHTML = `
      <span class="dot" aria-hidden="true"></span>
      <span class="label">${key.charAt(0).toUpperCase() + key.slice(1)}</span>
    `;

    themeGrid.appendChild(btn);
  });
}

// einmalig beim Laden erzeugen
buildThemeGrid();

// NEU: Listen-Erstellung (Sofort vs. Modal)
const listCreateModeSegment = q("#listCreateModeSegment");
const notebookOpenModeSegment = q("#notebookOpenModeSegment");


function markListCreateMode(){
  if (!listCreateModeSegment) return;
  [...listCreateModeSegment.querySelectorAll(".seg-btn")].forEach(b=>{
    const on = (prefs.ui.listCreateMode === "modal" && b.dataset.create === "modal")
            || (prefs.ui.listCreateMode !== "modal" && b.dataset.create === "instant");
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function markNotebookOpenMode(){
  if (!notebookOpenModeSegment) return;
  [...notebookOpenModeSegment.querySelectorAll(".seg-btn")].forEach(b=>{
    const on = (prefs.ui.nbOpen === "new"  && b.dataset.nb === "new")
            || (prefs.ui.nbOpen !== "new"  && b.dataset.nb === "same");
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}


function switchSettingsView(view){
  _settingsView = view;

  const isMenu    = view === "menu";
  const isDesign  = view === "design";
  const isMisc    = view === "misc";
  const isVersion = view === "version"; // NEU

  // Sichtbarkeit der Bereiche
  const vis = (el, show) => {
    if (!el) return;
    el.hidden = !show;
    el.style.display = show ? "" : "none";
  };
  vis(settingsMenu,    isMenu);
  vis(settingsDesign,  isDesign);
  vis(settingsMisc,    isMisc);
  vis(settingsVersion, isVersion); // NEU

  // Header-Titel
  if (settingsHeader){
    settingsHeader.textContent = isMenu ? "Einstellungen"
                           : (isDesign ? "Design"
                           : (isMisc ? "Sonstiges"
                                     : "Version")); // NEU
  }

  // Aktuelle Ansicht zusätzlich am Modal notieren (für CSS-Regel)
  if (settingsModal) {
    settingsModal.dataset.view = view; // "menu" | "design" | "misc" | "version"
  }

  // Back-Button nur auf Unterebenen anzeigen
  if (settingsBackBtn){
    const showBack = !isMenu;
    settingsBackBtn.hidden = !showBack;
    settingsBackBtn.setAttribute("aria-hidden", showBack ? "false" : "true");
  }

  // NEU: Titel in der Version-Ansicht live aus Prefs setzen
  if (isVersion){
    const aboutTitle = document.getElementById("aboutAppTitle");
    if (aboutTitle) aboutTitle.textContent = prefs.appTitle || "Bucket Liste";
  }
}





// === Click-Ripple für Buttons/Kacheln (Mode + Themes) ===
function attachRipple(container, buttonSelector){
  if (!container) return;
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(buttonSelector);
    if (!btn || !container.contains(btn)) return;

    // Position/Größe bestimmen
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = (e.clientX ?? (rect.left + rect.width/2)) - rect.left - size/2;
    const y = (e.clientY ?? (rect.top + rect.height/2)) - rect.top  - size/2;

    // Element erzeugen
    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.setProperty("--rs", size + "px");
    dot.style.setProperty("--rx", x + "px");
    dot.style.setProperty("--ry", y + "px");
    btn.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove(), { once:true });

    // kurzer „Clicked“-State für Swatches
    if (btn.classList.contains("theme-swatch")){
      btn.classList.add("clicked");
      setTimeout(()=> btn.classList.remove("clicked"), 220);
    }
  });
}

// aktivieren
attachRipple(modeSegment, ".seg-btn");
attachRipple(themeGrid, ".theme-swatch");


// Splitter (zwischen Sidebar und Content)
const sidebarResizer = q("#sidebarResizer");

if (sidebarResizer){
  sidebarResizer.addEventListener("dblclick", () => toggleSidebar());
}

// Progress UI
const progressBar = q("#progressBar");
const progressText = q("#progressText");

// ===== Helpers (dates etc.) =====

function buildSubtaskRow(data = { id: uid(), text: "", done: false }) {
  const row = document.createElement("div");
  row.className = "subtask-row";
  row.dataset.id = data.id;

  row.innerHTML = `
    <input type="checkbox" class="subtask-done" ${data.done ? "checked" : ""} />
    <input type="text" class="subtask-input" placeholder="Unteraufgabe…" value="${(data.text || "").replace(/"/g, '&quot;')}" />
    <button type="button" class="subtask-remove" title="Entfernen">✕</button>
  `;

  const removeBtn = row.querySelector(".subtask-remove");
  removeBtn.addEventListener("click", () => row.remove());

  return row;
}

function readSubtasksFromModal(container) {
  const rows = [...container.querySelectorAll(".subtask-row")];
  return rows.map(r => {
    const id = r.dataset.id || uid();
    const done = r.querySelector(".subtask-done")?.checked || false;
    const text = (r.querySelector(".subtask-input")?.value || "").trim();
    return { id, text, done };
  }).filter(st => st.text.length > 0); // leere Zeilen ignorieren
}

function renderSubtasksPreview(ul, item) {
  if (!ul) return;
  const arr = Array.isArray(item.subtasks) ? item.subtasks : [];

  // Keine Unteraufgaben → das Element komplett entfernen,
  // damit keinerlei Leerraum/Bar mehr bleibt.
  if (!arr.length) {
    ul.remove();
    return;
  }

  // Wenn Unteraufgaben vorhanden sind → normal rendern
  ul.innerHTML = "";
  arr.forEach(st => {
    const li = document.createElement("li");
    li.className = st.done ? "done" : "";
    li.dataset.id = st.id;

    li.innerHTML = `
      <input type="checkbox" ${st.done ? "checked" : ""} />
      <span>${st.text || ""}</span>
    `;

    // Checkbox in der Vorschau direkt toggeln & speichern
    const cb = li.querySelector("input[type='checkbox']");
    cb.addEventListener("change", () => {
      st.done = !!cb.checked;
      li.classList.toggle("done", st.done);
      saveState();
    });

    ul.appendChild(li);
  });

  // Sicherstellen, dass die Liste sichtbar ist, wenn es Subtasks gibt
  ul.hidden = false;
}



function renderProfileBadge(){
  if (!profileBadge || !profileText) return;

  const first = (prefs.profile?.first || "").trim();
  const last  = (prefs.profile?.last  || "").trim();
  const org   = (prefs.profile?.org   || "").trim();
  const name  = [first, last].filter(Boolean).join(" ");

  if (!name){
    profileBadge.hidden = true;
    return;
  }

  // Text: "Vorname Nachname (Organisation)" – Klammer nur wenn org gesetzt
  profileText.textContent = org ? `${name} (${org})` : name;

  // Avatar
  if (prefs.profile?.avatar){
    profileAvatar.src = prefs.profile.avatar;
    profileAvatar.alt = `Profilbild von ${name}`;
  } else {
    // Fallback: transparentes 1x1 Pixel – oder du könntest ein Platzhalter-Icon nehmen
    profileAvatar.removeAttribute("src");
    profileAvatar.alt = "Profilbild";
  }

  profileBadge.hidden = false;
}

function setAppTitleUI(){
  if (appTitleEl){
    appTitleEl.textContent = prefs.appTitle || "Bucket Liste";
  }
}


function openProfileModal(prefill = true){
  if (!profileModal) return;
  if (prefill){
    profileFirst.value = prefs.profile?.first || "";
    profileLast.value  = prefs.profile?.last  || "";
    profileOrg.value   = prefs.profile?.org   || "";
    _profileAvatarData = prefs.profile?.avatar || null;
    if (profilePreview){
      if (_profileAvatarData){ profilePreview.src = _profileAvatarData; }
      else { profilePreview.removeAttribute("src"); }
    }
      refreshFloatingProfileFields();
  }

  openModal(profileModal);
}

function maybeShowProfileOnFirstRun(){
  const hasName = (prefs.profile?.first || "").trim() && (prefs.profile?.last || "").trim();
  if (!hasName){
    openProfileModal(true);
  }
}

const getListById = id => state.lists.find(l => l.id === id) || null;
const getSelectedList = () => getListById(state.selectedListId);

(function initSidebarResize(){
  if (!sidebarResizer) return;
  const MIN = 220, MAX = 520;

  let startX = 0, startW = prefs.ui.sideW || 280;
  let dragging = false;

  function onMove(e){
    if (!dragging) return;
    const clientX = (e.touches && e.touches[0]?.clientX) || e.clientX;
    const dx = clientX - startX;
    const w = clamp(startW + dx, MIN, MAX);
    setCSS("--sidebar-w", w + "px");
    prefs.ui.sideW = w;
    if (sideWidthRange){ sideWidthRange.value = String(w); if (sideWidthValue) sideWidthValue.textContent = w + "px"; }
    if (sideWidthRange) applyRangeFill(sideWidthRange);   

  }
  function onUp(){
    if (!dragging) return;
    dragging = false;
    sidebarResizer.classList.remove("dragging");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    savePrefs();
  }

  sidebarResizer.addEventListener("mousedown", (e)=>{
    dragging = true; startX = e.clientX; startW = prefs.ui.sideW || 280;
    sidebarResizer.classList.add("dragging");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
  sidebarResizer.addEventListener("touchstart", (e)=>{
    dragging = true; startX = e.touches[0].clientX; startW = prefs.ui.sideW || 280;
    sidebarResizer.classList.add("dragging");
    window.addEventListener("touchmove", onMove, {passive:false});
    window.addEventListener("touchend", onUp);
  }, {passive:true});
})();

// Hintergrund-Dropdown
if (bgSelect && !bgSelect._wired){
  bgSelect.addEventListener("change", () => {
    const val = bgSelect.value;
    // Sicherheitscheck gegen erlaubte Keys
    const allowed = ["zurich","geneva","zug","prizren","chur","luzern","lugano"];
    prefs.bg = allowed.includes(val) ? val : "zurich";
    savePrefs();
    applyPrefs(); // setzt --bg-url sofort
  });
  bgSelect._wired = true;
}

// Profilbild-Datei → Data-URL lesen & Vorschau aktualisieren
if (profileImageInput && !profileImageInput._wired){
  profileImageInput._wired = true;
  profileImageInput.addEventListener("change", (e)=>{
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      _profileAvatarData = String(reader.result || "");
      if (profilePreview) profilePreview.src = _profileAvatarData;
    };
    reader.readAsDataURL(file);
  });
}

// „Später“ (nur schließen, nichts speichern)
if (profileCancel && !profileCancel._wired){
  profileCancel._wired = true;
  profileCancel.addEventListener("click", ()=> closeModal(profileModal));
}

// Formular speichern
if (profileForm && !profileForm._wired){
  profileForm._wired = true;
  profileForm.addEventListener("submit", (e)=>{
    e.preventDefault();
    const first = (profileFirst.value || "").trim();
    const last  = (profileLast.value  || "").trim();
    const org   = (profileOrg.value   || "").trim();
    if (!first || !last){
      // Minimaler Guard: beide Pflicht
      (first ? profileLast : profileFirst).focus();
      return;
    }

    prefs.profile = {
      first, last, org,
      avatar: _profileAvatarData || null
    };
    savePrefs();
    renderProfileBadge();
    refreshFloatingProfileFields();
    closeModal(profileModal);

    showToast({
      title: 'Profil gespeichert',
      subtitle: `${first} ${last}${org ? " ("+org+")" : ""}`,
      duration: 3500
    });
  });
}

// Drawer-Button „Profil“ öffnet Modal
if (openProfileBtn && !openProfileBtn._wired){
  openProfileBtn._wired = true;
  openProfileBtn.addEventListener("click", ()=>{
    closeDrawer();
    setTimeout(()=> openProfileModal(true), 200);
  });
}


function fmtDue(dateStr, timeStr){
  if(!dateStr && !timeStr) return "";
  const t = timeStr || "00:00";
  const d = new Date(`${dateStr || ""}T${t}`);
  if (isNaN(d)) return "";
  return d.toLocaleString([], { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function isoToDate(iso){ return iso ? new Date(iso + "T00:00:00") : null; }
function dateToISO(d){ if (!d || isNaN(d)) return ""; const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const dd=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }

function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function addWeeks(d, n){ return addDays(d, n*7); }
function addMonthsClamped(d, n){
  const x = new Date(d);
  const day = x.getDate();
  x.setMonth(x.getMonth()+n);
  // Bei Monatsende nach unten clampen (z.B. 31. → 30./28.)
  while (x.getDate() < day && x.getMonth() === (new Date(d).getMonth()+n+12)%12){ x.setDate(x.getDate()-1); }
  return x;
}

function nextDueDateISO(currentISO, repeat){
  const d = isoToDate(currentISO);
  if (!d) return "";
  if (repeat === "daily")   return dateToISO(addDays(d, 1));
  if (repeat === "weekly")  return dateToISO(addWeeks(d, 1));
  if (repeat === "monthly") return dateToISO(addMonthsClamped(d, 1));
  return ""; // none
}

// erzeugt ggf. nächste Instanz in derselben Liste
function maybeCreateNextOccurrence(item, list){
  if (!item || !list) return;
  if (item.repeat === "none") return;
  if (!item.dueDate) return; // Ohne Ankerdatum keine Wiederholung

  const nextDate = nextDueDateISO(item.dueDate, item.repeat);
  if (!nextDate) return;

  // Endbedingungen prüfen
  if (item.repeatEnd === "until" && item.repeatUntil){
    if (nextDate > item.repeatUntil) return;
  }
  let nextLeft = (typeof item.repeatLeft === "number") ? (item.repeatLeft - 1) : null;
  if (item.repeatEnd === "after"){
    if (nextLeft != null && nextLeft <= 0) return;
  }

  const newItem = {
    id: uid(),
    title: item.title,
    notes: item.notes,
    dueDate: nextDate,
    dueTime: item.dueTime,
    priority: item.priority,
    createdAt: Date.now(),
    done: false,
    repeat: item.repeat,
    repeatEnd: item.repeatEnd,
    repeatCount: item.repeatCount,
    repeatUntil: item.repeatUntil,
    repeatLeft: (item.repeatEnd === "after") ? (nextLeft ?? item.repeatCount ?? null) : null
  };
  list.items.unshift(newItem);
  lastAnimItemId = newItem.id;
}

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function prioLabel(p){
  return p==="low" ? "Niedrig" : p==="high" ? "Dringend" : "Mittel";
}

function repeatLabel(rep){
  return rep === "daily"   ? "Täglich"
       : rep === "weekly"  ? "Wöchentlich"
       : rep === "monthly" ? "Monatlich"
       : "";
}


// ===== Galaxy Starfield Renderer =====
let _galaxy = null;

function startGalaxy(){
  if (!galaxyCanvas) return;
  if (_galaxy) { _galaxy.start(); return; }
  _galaxy = createStarfield(galaxyCanvas);
  _galaxy.start();
}

function stopGalaxy(){
  _galaxy?.stop();
}

function createStarfield(canvas){
  const ctx = canvas.getContext("2d");
  let raf = 0, running = false;
  const layers = [];
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  function resize(){
    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width  = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    layers.length = 0;
    // drei Parallax-Schichten
    layers.push(buildLayer(90,  0.08, 0.6));  // fern
    layers.push(buildLayer(70,  0.16, 0.8));  // mittel
    layers.push(buildLayer(40,  0.28, 1.0));  // nah
  }

  function rand(min, max){ return Math.random()*(max-min)+min; }

  function buildLayer(count, speed, alpha){
    const stars = [];
    for (let i=0;i<count;i++){
      stars.push({
        x: rand(0, canvas.width),
        y: rand(0, canvas.height),
        r: rand(0.4, 1.6),
        a: alpha * rand(0.6, 1.0),
        vx: speed * (Math.random()<.5 ? 1 : -1),
        vy: speed * (Math.random()<.5 ? 1 : -1),
      });
    }
    return { stars, speed };
  }

  function drawNebula(){
    const w = canvas.width / DPR, h = canvas.height / DPR;
    const g = ctx.createRadialGradient(w*0.7, h*0.3, 20, w*0.5, h*0.4, Math.max(w,h)*0.9);
    g.addColorStop(0.0, "rgba(14,165,255,0.22)");
    g.addColorStop(0.4, "rgba(14,165,255,0.10)");
    g.addColorStop(1.0, "rgba(2,6,23,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);
  }

  function tick(){
    if (!running) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    // Nebula-Glow
    drawNebula();

    // Sterne
    for (const {stars} of layers){
      for (const s of stars){
        s.x += s.vx; s.y += s.vy;
        if (s.x < 0) s.x += w; else if (s.x > w) s.x -= w;
        if (s.y < 0) s.y += h; else if (s.y > h) s.y -= h;

        ctx.globalAlpha = s.a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
        ctx.fillStyle = "#E0F5FF";
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }

  function start(){
    if (running) return;
    running = true;
    resize();
    window.addEventListener("resize", resize);
    tick();
  }
  function stop(){
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  }
  return { start, stop };
}


// ===== Button pop animation =====
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".pressable");
  if(!btn) return;
  btn.classList.remove("pop");
  requestAnimationFrame(()=> btn.classList.add("pop"));
  btn.addEventListener("animationend", ()=> btn.classList.remove("pop"), { once:true });
});

// ===== Drawer open/close =====
function openDrawer(){
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden","false");
  menuBtn?.classList?.add("open"); // falls Burger-Morph CSS genutzt wird
}
function closeDrawer(){
  // 'closing' = animierter Rückweg
  drawer.classList.add("closing");
  drawer.classList.remove("open");
  menuBtn?.classList?.remove("open");
  drawer.setAttribute("aria-hidden","true");

  // Auf das Ende der Panel-Transition warten
  const panel = drawer.querySelector(".drawer-panel");
  const onDone = () => {
    drawer.classList.remove("closing");
    panel.removeEventListener("transitionend", onDone);
  };
  // Falls kein Panel gefunden oder User bevorzugt reduzierte Bewegung → Fail-safe Timeout
  if (panel) {
    panel.addEventListener("transitionend", onDone, { once: true });
  } else {
    setTimeout(() => drawer.classList.remove("closing"), 300);
  }
}

if (menuBtn) menuBtn.addEventListener("click", ()=>{
  if (drawer.classList.contains("open")) closeDrawer(); else openDrawer();
});
if (drawer) drawer.addEventListener("click", (e)=>{
  if (e.target.classList.contains("drawer-backdrop")) closeDrawer();
});

/* ===== Backup & Restore ===== */
function exportBackup(){
  const payload = {
    __type: "bucket-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    storage: {
      [STORAGE_KEY]: state,
      [PREFS_KEY]:   prefs
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const d = new Date();
  const fname = `bucket-backup-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}.json`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  a.remove();

  // Nach erfolgreichem Export:
showToast({
  title: 'Erfolgreich',
  subtitle: 'Erfolgreich exportiert',
  duration: 5000,                  // 5s, gerne anpassen
  accentColor: '#22c55e'           // grün für die Progressbar (optional)
});

}

function importBackupText(text){
  let data;
  try{
    data = JSON.parse(text);
  }catch(e){
    alert("Ungültige Datei (kein JSON).");
    return;
  }

  // Flexible Annahme: neuer Wrapper (storage) ODER direkt der State
  let newState = null, newPrefs = null;
  if (data && data.storage){
    newState = data.storage[STORAGE_KEY] || null;
    newPrefs = data.storage[PREFS_KEY]   || null;
  } else if (data && data.lists){
    newState = data; // raw state
  }

  if (!newState || !Array.isArray(newState.lists)){
    // Fehler-Toast bei ungültigem Import
const xSVG = `
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;

showToast({
  title: 'Fehlgeschlagen',
  subtitle: 'Ungültiger Import',
  duration: 5000,
  accentColor: '#ef4444',    // Rot für die Progressbar
  iconSVG: `<div style="color:#ef4444;">${xSVG}</div>` // rotes Icon
});
    return;
  }

  // Normalisieren & übernehmen
  const normalized = normalizeState(newState);
  state.lists = normalized.lists;
  state.selectedListId = normalized.selectedListId;
  saveState();

  if (newPrefs){
    if (THEME_MAP[newPrefs.theme]) prefs.theme = newPrefs.theme;
    if (isNum(newPrefs.glassAlphaStrong)) prefs.glassAlphaStrong = clamp(newPrefs.glassAlphaStrong, .3, .95);
    if (isNum(newPrefs.cardAlpha))        prefs.cardAlpha        = clamp(newPrefs.cardAlpha, .3, .98);
    if (newPrefs.mode === "dark" || newPrefs.mode === "light") prefs.mode = newPrefs.mode;
    savePrefs();
  }

  applyPrefs();
  render();
    // Nach erfolgreichem Export:
showToast({
  title: 'Erfolgreich',
  subtitle: 'Erfolgreich importiert',
  duration: 5000,                  // 5s, gerne anpassen
  accentColor: '#22c55e'           // grün für die Progressbar (optional)
});
}

if (backupBtn) backupBtn.addEventListener("click", exportBackup);

if (restoreInput) restoreInput.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    const text = await file.text();
    importBackupText(text);
  } finally {
    // Auswahl zurücksetzen, damit man dieselbe Datei erneut wählen kann
    e.target.value = "";
  }
});

// moderne Select-Optik aktivieren
document.querySelectorAll('select').forEach(el => el.classList.add('select-modern'));



// ===== Render: Lists =====
// ===== Render: Lists =====
function renderLists(){
  listsNav.innerHTML = "";
  state.lists.forEach(list => {
    const row = listButtonTpl.content.firstElementChild.cloneNode(true);
    const btn = q(".list-btn", row);
    const nameEl = q(".list-name", row);
    const renameBtn = q('[data-action="rename"]', row);
    const deleteBtn = q('[data-action="delete"]', row);
    const handle = q(".drag-handle.list", row);
const icoEl = q(".list-ico", row);
if (icoEl) {
  if (list.icon) {
    icoEl.src = list.icon;
    icoEl.hidden = false;
  } else {
    icoEl.hidden = true;
    icoEl.removeAttribute("src");
  }
}


    nameEl.textContent = list.name;
    btn.dataset.id = list.id;
    btn.classList.toggle("active", list.id === state.selectedListId);

    btn.addEventListener("click", () => smoothSelectList(list.id));
renameBtn.addEventListener("click", (e)=>{ 
  e.stopPropagation();
  openListEditModal(list.id);
});
btn.addEventListener("dblclick", () => openListEditModal(list.id));

    deleteBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      if (confirm(`Liste "${list.name}" wirklich löschen?`)){
        const idx = state.lists.findIndex(l => l.id === list.id);
        if (idx > -1) state.lists.splice(idx, 1);
        if (state.selectedListId === list.id) state.selectedListId = state.lists[0]?.id ?? null;
        saveState(); render();
      }
    });

    // Items in Liste droppen → ans Ende
    row.addEventListener("dragover", (e)=>{
      if (dragState?.type === "item"){ e.preventDefault(); row.classList.add("drop-target"); }
    });
    row.addEventListener("dragleave", ()=> row.classList.remove("drop-target"));
    row.addEventListener("drop", ()=>{
      row.classList.remove("drop-target");
      if (dragState?.type === "item"){
        moveItemRelative(dragState.itemId, dragState.fromListId, list.id, null);
      }
    });

    // Listen sortieren
    handle.addEventListener("mousedown", ()=> row.draggable = true);
    handle.addEventListener("touchstart", ()=> row.draggable = true, {passive:true});
    row.addEventListener("dragstart", (e)=>{
      row.classList.add("dragging");
      startDrag({ type:"list", listId: list.id }, e.dataTransfer);
    });
    row.addEventListener("dragend", ()=>{
      row.classList.remove("dragging");
      row.draggable = false;
      endDrag();
    });

    listsNav.appendChild(row);
  });
}

// ===== Inline Rename (contenteditable) für Listennamen =====
function startInlineRename(listId){
  const btn = listsNav.querySelector(`.list-btn[data-id="${CSS.escape(listId)}"]`);
  if (!btn) return;
  const nameEl = btn.querySelector(".list-name");
  if (!nameEl) return;

  // aktives List-Objekt
  const listObj = state.lists.find(l => l.id === listId);
  if (!listObj) return;

  if (btn._editing) return; // schon im Edit
  btn._editing = true;
  btn.classList.add("editing");

  const prev = listObj.name || "";
  nameEl.setAttribute("contenteditable", "true");
  nameEl.setAttribute("role", "textbox");
  nameEl.setAttribute("aria-label", "Listenname bearbeiten");
  nameEl.spellcheck = false;

  // Fokus + kompletten Text markieren
  requestAnimationFrame(()=>{
    nameEl.focus();
    try{
      const r = document.createRange();
      r.selectNodeContents(nameEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }catch(_){}
  });

  function finish(save){
    // Aufräumen & speichern
    const raw = (nameEl.textContent || "").replace(/\s+/g, " ").trim();
    const newVal = save ? (raw || prev || "Neue Liste") : prev;

    listObj.name = newVal;
    saveState();
    // Nur Listen neu zeichnen, damit Fokus nicht „springt“
    renderLists();

    // Auswahl beibehalten
    smoothSelectList(listId);
  }

  function onKey(e){
    if (e.key === "Enter"){
      e.preventDefault(); finish(true);
    } else if (e.key === "Escape"){
      e.preventDefault(); finish(false);
    } else if (e.key === "Tab"){
      e.preventDefault(); finish(true);
    }
  }

  function onBlur(){
    finish(true);
  }

  nameEl.addEventListener("keydown", onKey);
  nameEl.addEventListener("blur", onBlur, { once: true });

  // Cleanup-Flag beim Re-Render hinfällig; hier reicht Klassen-/Attr-Reset
}


// ===== Smooth List Switch (fade) =====
const progressWrap = document.querySelector(".progress-wrap");
[itemsUl, emptyText, progressWrap].forEach(el => el && el.classList.add("list-switchable"));

function setActiveListUI(listId){
  [...listsNav.querySelectorAll(".list-btn")].forEach(b=>{
    const isActive = b.dataset.id === listId;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-current", isActive ? "true" : "false");
  });
}
let _isSwitching = false;
function smoothSelectList(newListId){
  if (_isSwitching || state.selectedListId === newListId) return;
  _isSwitching = true;

  // Active-UI sofort
  setActiveListUI(newListId);

  const els = [itemsUl, emptyText, progressWrap].filter(Boolean);
  els.forEach(el => el.classList.add("list-switch-out"));

  setTimeout(() => {
    state.selectedListId = newListId;
    saveState();
    renderItems();

    requestAnimationFrame(() => {
      els.forEach(el => {
        el.classList.remove("list-switch-out");
        el.classList.add("list-switch-in");
        el.addEventListener("animationend", () => el.classList.remove("list-switch-in"), { once:true });
      });
      itemsUl?.scrollTo?.({ top:0, behavior:"auto" });
      _isSwitching = false;
    });
  }, 180);
}

// ===== Drag & Drop (globaler dragState) =====
let dragState = null; // { type:"item"| "list", itemId?, fromListId?, listId? }
function startDrag(state, dt){ dragState = state; try { dt.setData("text/plain", "drag"); } catch{} dt.effectAllowed = "move"; }
function endDrag(){ dragState = null; clearDropMarker(); clearListDropMarker(); itemsUl.classList.remove("drag-active"); }

// ===== Render: Items =====
let lastAnimItemId = null;

function applySearchAndFilters(items){
  let arr = [...items];
  const qstr = (searchInput?.value || "").trim().toLowerCase();
  if (qstr){
    arr = arr.filter(it =>
      (it.title || "").toLowerCase().includes(qstr) ||
      (it.notes || "").toLowerCase().includes(qstr)
    );
  }
  const st = statusFilter?.value || "all";
  if (st === "open") arr = arr.filter(it => !it.done);
  else if (st === "done") arr = arr.filter(it => it.done);

  const due = dueFilter?.value || "all";
  const today = todayISO();
  if (due === "today"){
    arr = arr.filter(it => it.dueDate === today);
  } else if (due === "overdue"){
    arr = arr.filter(it => !it.done && getDueTimestamp(it.dueDate, it.dueTime) && getDueTimestamp(it.dueDate, it.dueTime) < Date.now());
  }

  const pf = prioFilter?.value || "all";
  if (["low","med","high"].includes(pf)) arr = arr.filter(it => it.priority === pf);

  return arr;
}

// Hilfsfunktion: Fälligkeit in Timestamp (ms) wandeln; ohne Datum → null
function getDueTimestamp(d, t){
  if (!d) return null;
  const s = t ? `${d}T${t}` : `${d}T23:59`;
  const ts = Date.parse(s);
  return Number.isNaN(ts) ? null : ts;
}

// Sortiert ein Array von Items gemäß sortBy
function sortItems(arr){
  
   const mode = (sortBy && sortBy.value) ? sortBy.value : "due";

  // NEU: keine Sortierung → originale Reihenfolge behalten
  if (mode === "none") return arr;

  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const prioRank = (p) => (p === "high" ? 0 : p === "med" ? 1 : p === "low" ? 2 : 3);
  const statusRank = (it) => (it.done ? 1 : 0);

  return arr.slice().sort((a, b) => {
    const titleCmp = () => collator.compare((a.title || ""), (b.title || ""));
    const dueA = getDueTimestamp(a.dueDate, a.dueTime);
    const dueB = getDueTimestamp(b.dueDate, b.dueTime);
    const hasA = dueA != null, hasB = dueB != null;

    if (mode === "title") return titleCmp();

    if (mode === "prio"){
      const d = prioRank(a.priority) - prioRank(b.priority);
      if (d) return d;
      if (hasA && hasB && dueA !== dueB) return dueA - dueB; // früher zuerst
      if (hasA !== hasB) return hasA ? -1 : 1;               // Items mit Datum vor ohne
      return titleCmp();
    }

    if (mode === "status"){
      const d = statusRank(a) - statusRank(b);               // offen vor erledigt
      if (d) return d;
      if (hasA && hasB && dueA !== dueB) return dueA - dueB;
      if (hasA !== hasB) return hasA ? -1 : 1;
      const pr = prioRank(a.priority) - prioRank(b.priority); // high vor low
      if (pr) return pr;
      return titleCmp();
    }

    // Default: mode === "due"
    if (hasA && hasB){
      if (dueA !== dueB) return dueA - dueB;
    } else if (hasA !== hasB){
      return hasA ? -1 : 1;
    }
    // Tiebreaker: offen vor erledigt → Priorität (high→low) → erstellt ↑ → Titel
    const s = statusRank(a) - statusRank(b);
    if (s) return s;
    const pr = prioRank(a.priority) - prioRank(b.priority);
    if (pr) return pr;
    const ca = (a.createdAt || 0) - (b.createdAt || 0);
    if (ca) return ca;
    return titleCmp();
  });
}


function renderItems(){
  const list = getSelectedList();
  itemsUl.innerHTML = "";

  if (!list){
    emptyText.textContent = "Lege links eine Liste an, um Einträge zu erstellen.";
    emptyText.style.display = "block";
    updateProgress(null);
    return;
  }

// === Archiv-Button oben ein-/ausblenden ===
const topClearBtn = document.getElementById('clearArchiveBtn');
if (topClearBtn) {
  // sichtbar nur in der Archivliste (optional: nur wenn Items vorhanden)
  const inArchive = isArchiveList(list);
  topClearBtn.hidden = !(inArchive && (list.items?.length ?? 0) >= 0);
  // Click-Handler einmalig verdrahten
  if (!topClearBtn._wired) {
    topClearBtn.addEventListener('click', () => openClearArchiveModal());
    topClearBtn._wired = true;
  }
}



  const toShow = applySearchAndFilters(list.items);
  const ordered = sortItems(toShow);


  emptyText.style.display = toShow.length ? "none" : "block";
  if (!toShow.length){
    emptyText.textContent = list.items.length ? "Keine Einträge entsprechen Suche/Filter." : "Aktuell sind keine Einträge vorhanden";
  }

  ordered.forEach(item => {
    const li = itemTpl.content.firstElementChild.cloneNode(true);
    li.dataset.id = item.id;

    const cb = q("input", li);
    cb.checked = !!item.done;
    li.classList.toggle("done", !!item.done);
    cb.addEventListener("change", (e)=> handleToggleDone(e, item, list, li));
    


    q(".title", li).textContent = item.title || "";
    const notesEl = q(".notes", li);
    notesEl.hidden = !(item.notes || "").trim();
    if (!notesEl.hidden) notesEl.textContent = item.notes.trim();
    // Unteraufgaben-Vorschau füllen
    const subtasksUl = q(".subtasks-preview", li);
    renderSubtasksPreview(subtasksUl, item);


    const prioEl = q(".prio", li);
    if (item.priority){
      prioEl.hidden = false;
      prioEl.textContent = prioLabel(item.priority);
      prioEl.classList.remove("low","med","high");
      prioEl.classList.add(item.priority);
    } else prioEl.hidden = true;

// ===== Fälligkeit-Badge =====
const dueEl = q(".due", li);
const dueStr = fmtDue(item.dueDate, item.dueTime);
const dueTs = getDueTimestamp(item.dueDate, item.dueTime);
const isOverdue = !item.done && dueTs && Date.now() > dueTs;

if (dueEl) {
  if (dueStr) {
    dueEl.textContent = dueStr;
    dueEl.hidden = false;
    dueEl.classList.toggle("overdue", !!isOverdue);
    dueEl.classList.toggle("done", !!item.done);
  } else {
    // Keine Fälligkeit -> Badge komplett entfernen
    dueEl.remove();
  }
}


    q('[data-action="edit"]', li).addEventListener("click", ()=> openItemModal("edit", item));
    q('[data-action="delete"]', li).addEventListener("click", ()=>{
      li.classList.add("anim-out");
      li.addEventListener("animationend", ()=>{
        const idx = list.items.findIndex(i => i.id === item.id);
        if (idx > -1) list.items.splice(idx, 1);
        saveState(); renderItems();
      }, { once:true });
    });

// Wiederholungs-Badge (rechts neben dem Bearbeiten-Icon)
const repEl = q(".repeat", li);
if (repEl) {
  if (item.repeat && item.repeat !== "none") {
    repEl.textContent = repeatLabel(item.repeat);
    repEl.hidden = false;
  } else {
    // komplett entfernen, wenn keine Wiederholung gesetzt ist
    repEl.remove();
  }
}


    const handle = q(".drag-handle", li);
    handle.addEventListener("mousedown", ()=> li.draggable = true);
    handle.addEventListener("touchstart", ()=> li.draggable = true, {passive:true});
    li.addEventListener("dragstart", (e)=>{
      li.classList.add("dragging");
      startDrag({ type:"item", itemId: item.id, fromListId: list.id }, e.dataTransfer);
    });
    li.addEventListener("dragend", ()=>{
      li.classList.remove("dragging");
      li.draggable = false;
      endDrag();
    });

    itemsUl.appendChild(li);

    if (lastAnimItemId === item.id){
      li.classList.add("anim-in");
      li.addEventListener("animationend", ()=> li.classList.remove("anim-in"), { once:true });
      lastAnimItemId = null;
    }
  });

  updateProgress(list, toShow);
}

function render(){ renderLists(); renderItems(); }

function moveItemToArchive(item, fromList){
  const arch = ensureArchiveList();
  // aus Quellliste raus
  const idx = fromList.items.findIndex(i => i.id === item.id);
  if (idx > -1) fromList.items.splice(idx, 1);

  // Herkunft speichern & als erledigt markieren
  item.originListId = fromList.id;
  item.done = true;

  // oben einfügen
  arch.items.unshift(item);

  saveState();
  render(); // Listen + Items aktualisieren
}

function restoreFromArchive(item){
  const arch = getArchiveList();
  if (!arch) return;

  // aus Archiv entfernen
  const idx = arch.items.findIndex(i => i.id === item.id);
  if (idx > -1) arch.items.splice(idx, 1);

  // Ziel: ursprüngliche Liste oder erste Nicht-Archiv-Liste
  let dest = state.lists.find(l => l.id === item.originListId && !isArchiveList(l));
  if (!dest) dest = state.lists.find(l => !isArchiveList(l)) || arch; // Fallback

  item.done = false;
  // optional: Herkunft löschen -> item.originListId = undefined;
  dest.items.unshift(item);
  lastAnimItemId = item.id;

  saveState();
  render();
}

function handleToggleDone(e, item, list, li){
  const checked = e.target.checked;

  if (checked){
    // Visuelles Celebrate am Item
    li.classList.add("flash");
    spawnConfetti(li);

    // === NEU: grüner Komet → Archiv + Impact-Burst
    const srcEl = li.querySelector('.checkbox') || li;
    flyCometToArchive(srcEl);

    // Danach wie gehabt: kurz Glow zeigen, Item ausblenden → Archiv verschieben
    setTimeout(()=>{
      li.classList.add("anim-out");
      li.addEventListener("animationend", ()=>{
        // Folgeereignis aus Wiederholung erzeugen (dein vorhandener Code)
        maybeCreateNextOccurrence(item, list);
        // ins Archiv verschieben (dein vorhandener Code)
        moveItemToArchive(item, list);
      }, { once:true });
    }, 450);

  } else {
    // wenn im Archiv ent-hakt → wiederherstellen
    if (isArchiveList(list)){
      restoreFromArchive(item);
    } else {
      // normales Undone außerhalb Archiv
      item.done = false;
      saveState();
      renderItems();
    }
  }
}



// ===== Progress (smooth) =====
let _progressAnim = { lastPct: 0, raf: null };
function animateProgressTo(targetPct, done, total){
  progressBar.classList.add('moving');
  progressBar.style.width = targetPct + '%';
  clearTimeout(progressBar._shimmerTO);
  progressBar._shimmerTO = setTimeout(()=> progressBar.classList.remove('moving'), 850);

  cancelAnimationFrame(_progressAnim.raf);
  const startPct = _progressAnim.lastPct;
  const start = performance.now();
  const dur = 520;
  const ease = t => t*(2-t);
  function tick(now){
    const t = Math.min(1, (now - start) / dur);
    const cur = Math.round(startPct + (targetPct - startPct) * ease(t));
    progressText.textContent = `${done} von ${total} erledigt (${cur}%)`;
    if (t < 1){
      _progressAnim.raf = requestAnimationFrame(tick);
    } else {
      _progressAnim.lastPct = targetPct;
    }
  }
  _progressAnim.raf = requestAnimationFrame(tick);
}
function updateProgress(list, visibleItems=[]){
  if (!progressBar || !progressText){ return; }
  if (!list){
    _progressAnim.lastPct = 0;
    progressBar.style.width = "0%";
    progressText.textContent = "0 von 0 erledigt (0%)";
    return;
  }
  const arr = Array.isArray(visibleItems) ? visibleItems : [];
  const total = arr.length;
  const done  = arr.filter(i => i.done).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  animateProgressTo(pct, done, total);
}

function showToast({
  title = '',
  subtitle = '',
  duration = 5000,
  accentColor,
  iconSVG
} = {}) {
  // Root sicherstellen
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    document.body.appendChild(root);
  }

  // Default-Icon (großer grüner Haken)
  const checkSVG = `
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M6.5 12.5l3.5 3.5 7.5-7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  // Toast-Element
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');

  // Icon + Text + Close
  toast.innerHTML = `
    <div class="toast-icon" style="color: #22c55e;">${iconSVG || checkSVG}</div>
    <div class="toast-body">
      <div class="toast-title"> ${title} </div>
      <div class="toast-subtitle"> ${subtitle} </div>
    </div>
    <button class="toast-close" aria-label="Schließen">×</button>
    <div class="progress">
      <div class="bar" ${accentColor ? `style="background:${accentColor};"` : ''}></div>
    </div>
  `;

  // Close-Verhalten
  const closeBtn = toast.querySelector('.toast-close');
  const bar = toast.querySelector('.progress .bar');

  let closed = false;
  let closeTimer;

  function closeToast() {
    if (closed) return;
    closed = true;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      toast.remove();
    }, 180);
  }

  closeBtn.addEventListener('click', closeToast);

  // ESC schließt den zuletzt erschienenen Toast
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', escHandler);
      closeToast();
    }
  };
  document.addEventListener('keydown', escHandler);

  // Einfügen & kleine Enter-Animation
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-6px)';
  root.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transition = 'opacity .18s ease, transform .18s ease';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Progressbar animieren (linear)
  if (bar) {
    // Dauer dynamisch setzen
    bar.style.transitionDuration = `${duration}ms`;
    // Start → Ende
    requestAnimationFrame(() => {
      bar.style.width = '0%';
    });
  }

  // Auto-Close
  if (duration > 0) {
    closeTimer = setTimeout(closeToast, duration);
  }

  // Cleanup, falls manuell vorher geschlossen
  toast.addEventListener('remove', () => {
    if (closeTimer) clearTimeout(closeTimer);
    document.removeEventListener('keydown', escHandler);
  });

  return closeToast; // optional: manuelles Schließen via Rückgabefunktion
}

// ===== Drag utils: Items =====
const dropMarker = document.createElement("li"); dropMarker.className = "drop-marker";
function clearDropMarker(){ if (dropMarker.parentElement) dropMarker.parentElement.removeChild(dropMarker); }

function getDragAfterElement(container, y, selector){
  const els = [...container.querySelectorAll(selector)];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const child of els){
    const box = child.getBoundingClientRect();
    const offset = y - (box.top + box.height/2);
    if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
  }
  return closest.element;
}

itemsUl.addEventListener("dragover", (e)=>{
  if (dragState?.type !== "item") return;
  e.preventDefault();
  itemsUl.classList.add("drag-active");
  const after = getDragAfterElement(itemsUl, e.clientY, ".item:not(.dragging)");
  if (after == null) itemsUl.appendChild(dropMarker);
  else itemsUl.insertBefore(dropMarker, after);
});
itemsUl.addEventListener("dragleave", (e)=>{
  const rel = e.relatedTarget || null;
  if (!rel || !itemsUl.contains(rel)) { itemsUl.classList.remove("drag-active"); clearDropMarker(); }
});
itemsUl.addEventListener("drop", (e)=>{
  if (dragState?.type !== "item") return;
  e.preventDefault();
  itemsUl.classList.remove("drag-active");
  const anchor = dropMarker.nextElementSibling?.closest?.(".item");
  const beforeId = anchor ? anchor.dataset.id : null;
  clearDropMarker();
  moveItemRelative(dragState.itemId, dragState.fromListId, state.selectedListId, beforeId);
});

function moveItemRelative(itemId, fromListId, toListId, beforeItemId){
  const src = getListById(fromListId);
  const dst = getListById(toListId);
  if (!src || !dst) return;
  const i = src.items.findIndex(it => it.id === itemId);
  if (i < 0) return;
  const [moved] = src.items.splice(i, 1);
  let idx = (beforeItemId) ? dst.items.findIndex(it => it.id === beforeItemId) : dst.items.length;
  if (idx < 0) idx = dst.items.length;
  dst.items.splice(idx, 0, moved);
  lastAnimItemId = moved.id;
  saveState();
  if (state.selectedListId !== toListId) state.selectedListId = toListId;
  render();
}

// ===== Drag utils: Lists (reorder) =====
const listDropMarker = document.createElement("div"); listDropMarker.className = "list-drop-marker";
function clearListDropMarker(){ if (listDropMarker.parentElement) listDropMarker.parentElement.removeChild(listDropMarker); }

listsNav.addEventListener("dragover", (e)=>{
  if (dragState?.type !== "list") return;
  e.preventDefault();
  const after = getDragAfterElement(listsNav, e.clientY, ".list-row:not(.dragging)");
  if (after == null) listsNav.appendChild(listDropMarker);
  else listsNav.insertBefore(listDropMarker, after);
});
listsNav.addEventListener("dragleave", (e)=>{
  const rel = e.relatedTarget || null;
  if (!rel || !listsNav.contains(rel)) clearListDropMarker();
});
listsNav.addEventListener("drop", (e)=>{
  if (dragState?.type !== "list") return;
  e.preventDefault();
  let targetIndex = getListRowDropIndex(listsNav, listDropMarker);
  if (targetIndex < 0) targetIndex = state.lists.length;
  clearListDropMarker();
  reorderList(dragState.listId, targetIndex);
  endDrag();
});

function getListRowDropIndex(container, marker){
  if (!marker.parentElement) return -1;
  const children = [...container.children];
  return children.indexOf(marker);
}

function reorderList(listId, toIndex){
  const i = state.lists.findIndex(l => l.id === listId);
  if (i < 0) return;
  const [moved] = state.lists.splice(i, 1);
  if (toIndex == null || toIndex > state.lists.length) toIndex = state.lists.length;
  state.lists.splice(toIndex, 0, moved);
  saveState();
  renderLists();
}

// ===== Modal: Items =====
let editItemRef = null;
let formPrio = "med";

function setPrioUI(p){
  formPrio = p;
  const btns = [...document.querySelectorAll("#prioSegment .seg-btn")];
  btns.forEach(b => b.classList.toggle("active", b.dataset.prio === p));

  // Animation auf dem gewählten Button (remove -> reflow -> add)
  const active = btns.find(b => b.dataset.prio === p);
  if (active){
    active.classList.remove("anim-prio");
    // Reflow erzwingen, damit die Animation jedes Mal erneut startet
    void active.offsetWidth;
    active.classList.add("anim-prio");
    active.addEventListener("animationend", () => active.classList.remove("anim-prio"), { once:true });
  }
}

// ===== Modal: Archiv leeren =====
const clearArchiveModal   = document.getElementById('clearArchiveModal');
const clearArchiveCancel  = document.getElementById('clearArchiveCancel');
const clearArchiveConfirm = document.getElementById('clearArchiveConfirm');

// Top-Button (neben "Neuer Eintrag") auch mit dem Modal verbinden
const clearArchiveTopBtn = document.getElementById('clearArchiveBtn');
if (clearArchiveTopBtn && !clearArchiveTopBtn._wired) {
  clearArchiveTopBtn.addEventListener('click', openClearArchiveModal);
  clearArchiveTopBtn._wired = true;
}


function openClearArchiveModal(){
  if (!clearArchiveModal) return;
  openModal(clearArchiveModal);
}
function closeClearArchiveModal(){
  if (!clearArchiveModal) return;
  closeModal(clearArchiveModal);
}

// Buttons verdrahten
if (clearArchiveCancel)  clearArchiveCancel.addEventListener('click', closeClearArchiveModal);
if (clearArchiveConfirm) clearArchiveConfirm.addEventListener('click', () => {
  const arch = getArchiveList(); // existiert bereits in deinem Code
  if (arch) {
    arch.items.length = 0;   // alles raus
    saveState();
    renderItems();
  }
  closeClearArchiveModal();

  // Toast mit Progressbar (auto-close + X)
  // showToast ist bereits vorhanden und animiert die Progressbar linear
  showToast({
    title: 'Archiv geleert',
    subtitle: 'Alle Einträge wurden entfernt.',
    duration: 4500,
    accentColor: '#ef4444'
  });
});


function openItemModal(mode="create", item=null){
  editItemRef = null;
  itemForm.reset();
  const subtasksContainer = document.getElementById("subtasksContainer");
const addSubtaskBtn = document.getElementById("addSubtaskBtn");

// Container leeren
if (subtasksContainer) subtasksContainer.innerHTML = "";

// Button-Wiring (einmal pro Öffnen)
if (addSubtaskBtn) {
  addSubtaskBtn.onclick = () => {
    subtasksContainer.appendChild(buildSubtaskRow());
    // Fokus in die neue Zeile
    const lastInput = subtasksContainer.querySelector(".subtask-row:last-child .subtask-input");
    lastInput?.focus();
  };
}

  if (mode === "edit" && item){
    modalTitle.textContent = "Eintrag bearbeiten";
    fTitle.value = item.title || "";
    fDate.value = item.dueDate || "";
    fTime.value = item.dueTime || "";
    fNotes.value = item.notes || "";
    setPrioUI(item.priority || "med");
    // bestehende Unteraufgaben anzeigen
    if (item?.subtasks?.length && subtasksContainer) {
      item.subtasks.forEach(st => subtasksContainer.appendChild(buildSubtaskRow(st)));
    }
    editItemRef = item;
  } else {
    modalTitle.textContent = "Neuer Eintrag";
    setPrioUI("med");
    // Defaults/Übernahme Repeat
if (mode === "edit" && item){
  if (fRepeat)      fRepeat.value      = item.repeat      || "none";
  if (fRepeatEnd)   fRepeatEnd.value   = item.repeatEnd   || "never";
  if (fRepeatCount) fRepeatCount.value = item.repeatCount ?? "";
  if (fRepeatUntil) fRepeatUntil.value = item.repeatUntil || "";
} else {
  if (fRepeat)      fRepeat.value      = "none";
  if (fRepeatEnd)   fRepeatEnd.value   = "never";
  if (fRepeatCount) fRepeatCount.value = "";
  if (fRepeatUntil) fRepeatUntil.value = "";
}
updateRepeatUI();

  }
  openModal(modal);
  // Fokus direkt in den Titel setzen (Cursor ans Ende)
requestAnimationFrame(() => {
  if (fTitle) {
    fTitle.focus();
    const v = fTitle.value || "";
    try { fTitle.setSelectionRange(v.length, v.length); } catch (_) {}
  }
});

}
function closeItemModal(){ closeModal(modal); }
if (cancelBtn) cancelBtn.addEventListener("click", closeItemModal);

if (prioSegment) prioSegment.addEventListener("click", (e)=>{
  const b = e.target.closest(".seg-btn");
  if (!b) return;
  setPrioUI(b.dataset.prio);
});

function saveItemFromForm(){
  const list = getSelectedList();
  if (!list){ alert("Bitte zuerst links eine Liste anlegen oder auswählen."); return; }

  const title = (fTitle.value || "").trim();
  if (!title){ fTitle.focus(); return; }

  const repeat      = fRepeat?.value || "none";
const repeatEnd   = fRepeatEnd?.value || "never";
const repeatCount = fRepeatCount?.value ? Math.max(1, parseInt(fRepeatCount.value, 10)) : null;
const repeatUntil = fRepeatUntil?.value || "";

// bei "none" alles neutralisieren
const normRepeatEnd   = (repeat === "none") ? "never" : repeatEnd;
const normRepeatCount = (repeat === "none" || normRepeatEnd !== "after") ? null : repeatCount;
const normRepeatUntil = (repeat === "none" || normRepeatEnd !== "until") ? ""   : repeatUntil;

// Unteraufgaben aus dem Modal einsammeln (oder [] wenn kein Container gefunden)
const subtasksContainer = document.getElementById("subtasksContainer");
const subtasks = subtasksContainer ? readSubtasksFromModal(subtasksContainer) : [];

const payload = {
  title,
  notes: (fNotes.value || "").trim(),
  dueDate: fDate.value || "",
  dueTime: fTime.value || "",
  priority: formPrio || "med",
  // NEU: Wiederholung
  repeat: repeat,
  repeatEnd: normRepeatEnd,         // "never" | "after" | "until"
  repeatCount: normRepeatCount,     // Zahl oder null
  repeatUntil: normRepeatUntil,     // ISO-Date oder ""
  repeatLeft: (normRepeatEnd === "after" && normRepeatCount != null) ? normRepeatCount : null,
  subtasks
};


  if (editItemRef){
    Object.assign(editItemRef, payload);
    lastAnimItemId = editItemRef.id;
  } else {
    const newId = uid();
    list.items.unshift({ id:newId, done:false, createdAt: Date.now(), ...payload });
    lastAnimItemId = newId;
  }
  saveState();
  closeItemModal();
  renderItems();
}
if (saveItemBtn) saveItemBtn.addEventListener("click", saveItemFromForm);
if (itemForm) itemForm.addEventListener("keydown", (e)=>{
  if (e.key === "Enter" && e.target.tagName !== "TEXTAREA"){
    e.preventDefault();
    saveItemFromForm();
  }
});

// ===== Settings (Topbar & Drawer) =====
function showSettingsModal(){
  markActiveTheme(prefs.theme);
  markActiveMode(prefs.mode);
  if (appTitleInput) appTitleInput.value = prefs.appTitle || "Bucket Liste";

  // Layout-Controls hydrieren (wie du es schon hattest)
  if (cardScaleRange){
    cardScaleRange.value = String(prefs.ui.cardScale.toFixed(2));
    if (cardScaleValue) cardScaleValue.textContent = prefs.ui.cardScale.toFixed(2);
    applyRangeFill(cardScaleRange);
  }
  if (sideWidthRange){
    sideWidthRange.value = String(prefs.ui.sideW);
    if (sideWidthValue) sideWidthValue.textContent = prefs.ui.sideW + "px";
    applyRangeFill(cardScaleRange);
  }
  if (pressSpeedRange){
    const speed = clamp(prefs.ui?.pressSpeed ?? 1, 0.5, 2);
    pressSpeedRange.value = String(speed);
    if (pressSpeedValue) pressSpeedValue.textContent = speed.toFixed(2) + "×";
    applyRangeFill(pressSpeedRange);
  }
  if (bgSelect){ bgSelect.value = prefs.bg; }

  const aboutTitle = document.getElementById("aboutAppTitle");
  if (aboutTitle) aboutTitle.textContent = prefs.appTitle || "Bucket Liste";

  // Start immer im Menü
  switchSettingsView("menu");
  openModal(settingsModal);
}

// Menükarte "Design"
if (openDesignBtn && !openDesignBtn._wired){
  openDesignBtn._wired = true;
  openDesignBtn.addEventListener("click", ()=>{
    switchSettingsView("design");
  });
}

// Menükarte "Version"
if (openVersionBtn && !openVersionBtn._wired){
  openVersionBtn._wired = true;
  openVersionBtn.addEventListener("click", ()=>{
    switchSettingsView("version");
  });
}


// Menükarte "Sonstiges"
if (openMiscBtn && !openMiscBtn._wired){
  openMiscBtn._wired = true;
  openMiscBtn.addEventListener("click", ()=>{
    switchSettingsView("misc");
  });
}

// Back-Button
if (settingsBackBtn && !settingsBackBtn._wired){
  settingsBackBtn._wired = true;
  settingsBackBtn.addEventListener("click", ()=>{
    switchSettingsView("menu");
  });
}


if (openSettingsBtn) openSettingsBtn.addEventListener("click", (e)=>{ e.preventDefault(); closeDrawer(); setTimeout(showSettingsModal, 200); });
if (openSettingsTop) openSettingsTop.addEventListener("click", (e)=>{ e.preventDefault(); showSettingsModal(); });

if (settingsCancel) settingsCancel.addEventListener("click", (e)=>{ e.preventDefault(); closeModal(settingsModal); });
if (settingsForm) settingsForm.addEventListener("submit", (e)=>{ e.preventDefault(); savePrefs(); closeModal(settingsModal); });

if (themeGrid) themeGrid.addEventListener("click", (e)=>{
  const btn = e.target.closest(".theme-swatch");
  if (!btn) return;
  const t = btn.dataset.theme;
  if (!THEME_MAP[t]) return;
  prefs.theme = t;
  savePrefs();       // <— PERSISTENZ FIX
  applyPrefs();
  markActiveTheme(t);
});


/* === Range-Füllung: setzt --val (0–100%) für die gefärbte Track-Hälfte === */
function applyRangeFill(el){
  if (!el) return;
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const val = Number(el.value || min);
  const pct = (max > min) ? Math.round(((val - min) / (max - min)) * 100) : 0;
  el.style.setProperty('--val', pct + '%');
}
function wireRangeFill(el){
  if (!el || el._wireFill) return;
  el._wireFill = true;
  applyRangeFill(el);
  el.addEventListener('input', () => applyRangeFill(el));
}

// === Darstellung umschalten (light|dark|galaxy) ===
if (modeSegment) modeSegment.addEventListener("click", (e)=>{
  const b = e.target.closest(".seg-btn");
  if (!b) return;
  const m = b.dataset.mode;
  if (!["light","dark","galaxy"].includes(m)) return;
  prefs.mode = m;
  applyPrefs();
});

// NEU: Umschalter „Neue Liste erstellen: Sofort | Modal“
if (listCreateModeSegment && !listCreateModeSegment._wired){
  listCreateModeSegment.addEventListener("click", (e)=>{
    const b = e.target.closest(".seg-btn"); if (!b) return;
    const val = (b.dataset.create === "modal") ? "modal" : "instant";
    prefs.ui.listCreateMode = val;
    savePrefs();
    markListCreateMode();
  });
  listCreateModeSegment._wired = true;
}

// NEU: Umschalter „Notizbuch öffnen: Gleicher Tab | Neuer Tab“
if (notebookOpenModeSegment && !notebookOpenModeSegment._wired){
  notebookOpenModeSegment.addEventListener("click", (e)=>{
    const b = e.target.closest(".seg-btn"); if (!b) return;
    const val = (b.dataset.nb === "new") ? "new" : "same";
    prefs.ui.nbOpen = val;
    savePrefs();
    markNotebookOpenMode();
  });
  notebookOpenModeSegment._wired = true;
}


if (appTitleInput && !appTitleInput._wired){
  appTitleInput._wired = true;
  appTitleInput.addEventListener("input", () => {
    // leere Eingabe -> Fallback auf Default
    prefs.appTitle = (appTitleInput.value || "").trim() || "Bucket Liste";
    setAppTitleUI();
    savePrefs();
  });
}




// Settings-UI utils
function markActiveTheme(key){
  [...document.querySelectorAll(".theme-swatch")].forEach(el=>{
    el.classList.toggle("selected", el.dataset.theme === key);
    const theme = THEME_MAP[el.dataset.theme];
    const dot = el.querySelector("span");
    if (dot && theme) dot.style.background = `linear-gradient(135deg, ${theme.accent2}, ${theme.accent})`;
  });
}
function markActiveMode(){
  const buttons = modeSegment?.querySelectorAll(".seg-btn") || [];
  buttons.forEach(b=>{
    const active = b.getAttribute("data-mode") === prefs.mode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

// ===== Modal infra (robust) =====
function openModal(m){
  if (!m) return;
  // Sichtbar machen, bevor Klassen gesetzt werden
  m.style.display = 'block';
  m.classList.remove('closing');
  m.classList.add('open');
  m.setAttribute('aria-hidden','false');
}

function closeModal(m){
  if (!m || (!m.classList.contains('open') && !m.classList.contains('closing'))) return;

  // Sofort interaktionslos machen, um "Blockiert"-Effekt zu vermeiden
  m.setAttribute('aria-hidden','true');
  m.classList.add('closing');
  m.classList.remove('open');

  const dlg = m.querySelector('.modal-dialog');
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    m.classList.remove('closing', 'open');
    m.style.display = 'none';
    dlg?.removeEventListener('animationend', cleanup);
    dlg?.removeEventListener('transitionend', cleanup);

  };

  // Sowohl Animations- als auch Transitions-Ende abfangen
  if (dlg) {
    dlg.addEventListener('animationend', cleanup, { once: true });
    dlg.addEventListener('transitionend', cleanup, { once: true });
    // Fallback, falls gar kein Event feuert (z. B. reduzierte Bewegung, CSS-Änderungen)
    setTimeout(cleanup, 360);
  } else {
    // Kein Dialog gefunden → sofort aufräumen
    cleanup();
  }
}


document.addEventListener("click", (e)=>{
  if (e.target.classList?.contains("modal-backdrop")){
    const m = e.target.parentElement; if (m) closeModal(m);
  }
});
document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape"){
    if (settingsModal?.classList.contains("open")) closeModal(settingsModal);
    if (modal?.classList.contains("open")) closeModal(modal);
  }
});

// Initialwerte setzen, wenn Modal geöffnet wird
function hydrateLayoutControls(){
  if (cardScaleRange){
    cardScaleRange.value = String(prefs.ui.cardScale.toFixed(2));
    if (cardScaleValue) cardScaleValue.textContent = prefs.ui.cardScale.toFixed(2);
    applyRangeFill(cardScaleRange);
  }
  if (sideWidthRange){
    sideWidthRange.value = String(prefs.ui.sideW);
    if (sideWidthValue) sideWidthValue.textContent = prefs.ui.sideW + "px";
    applyRangeFill(cardScaleRange);
  }
}
if (openSettingsBtn) openSettingsBtn.addEventListener("click", ()=> setTimeout(hydrateLayoutControls, 10));
if (openSettingsTop) openSettingsTop.addEventListener("click", ()=> setTimeout(hydrateLayoutControls, 10));

if (cardScaleRange) cardScaleRange.addEventListener("input", ()=>{
  const v = clamp(Number(cardScaleRange.value), 0.85, 1.35);
  prefs.ui.cardScale = v;
  if (cardScaleValue) cardScaleValue.textContent = v.toFixed(2);
  applyPrefs(); savePrefs();
});
if (sideWidthRange) sideWidthRange.addEventListener("input", ()=>{
  const v = clamp(Number(sideWidthRange.value), 220, 520);
  prefs.ui.sideW = v;
  if (sideWidthValue) sideWidthValue.textContent = v + "px";
  applyPrefs(); savePrefs();
});


// ===== List actions =====
let _renameTarget = null; // aktuell zu benennende Liste

function renameList(list){
  _renameTarget = list;
  const m = document.getElementById("renameModal");
  const inp = document.getElementById("renameInput");
  const form = document.getElementById("renameForm");
  if (!m || !inp || !form) return;

  // Titel/Value setzen
  inp.value = list.name || "";
  openModal(m);

  // Fokus + Cursor ans Ende
  requestAnimationFrame(() => {
    inp.focus();
    try {
      const v = inp.value || "";
      inp.setSelectionRange(v.length, v.length);
    } catch(_) {}
  });
}

// Event-Wiring für das Rename-Modal (einmalig)
(function wireRenameModal(){
  const m = document.getElementById("renameModal");
  const form = document.getElementById("renameForm");
  const inp = document.getElementById("renameInput");
  const cancelBtn = document.getElementById("renameCancel");

  if (!m || !form || !inp || form._wired) return;
  form._wired = true;

  // Bestätigen (Submit)
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const name = (inp.value || "").trim();
    if (_renameTarget && name){
      _renameTarget.name = name;
      saveState();
      renderLists();
    }
    closeModal(m);
    _renameTarget = null;
  });

  // Abbrechen
  cancelBtn?.addEventListener("click", ()=> {
    closeModal(m);
    _renameTarget = null;
  });

  // ESC schließt bereits global via closeModal-Handler
})();

// ===== Modal: Neue Liste erstellen =====
const listCreateModal     = document.getElementById('listCreateModal');
const listCreateForm      = document.getElementById('listCreateForm');
const listCreateName      = document.getElementById('listCreateName');
const listCreateCancelBtn = document.getElementById('listCreateCancel');
// NEU: Icon-Auswahl im "Neue Liste"-Modal
const listIconGrid = q("#listIconGrid");
let _selectedListIcon = null;

function resetListIconSelection(){
  _selectedListIcon = null;
  if (!listIconGrid) return;
  listIconGrid.querySelectorAll(".icon-tile").forEach(b=>{
    b.setAttribute("aria-pressed", "false");
  });
}

if (listIconGrid && !listIconGrid._wired){
  listIconGrid._wired = true;
  listIconGrid.addEventListener("click", (e)=>{
    const tile = e.target.closest(".icon-tile");
    if (!tile || !listIconGrid.contains(tile)) return;
    // Single-Select
    listIconGrid.querySelectorAll(".icon-tile").forEach(b=> b.setAttribute("aria-pressed","false"));
    tile.setAttribute("aria-pressed","true");
    _selectedListIcon = tile.dataset.icon || null;
  });
}


function openListCreateModal(){
  if (!listCreateModal || !listCreateForm || !listCreateName) return;
  // Formular zurücksetzen & öffnen
  listCreateForm.reset();
  resetListIconSelection();
  openModal(listCreateModal);
  refreshFloatingListField();

  // Fokus ins Namensfeld
  requestAnimationFrame(() => listCreateName?.focus());
  refreshFloatingListField();

}


function closeListCreateModal(){
  if (!listCreateModal) return;
  closeModal(listCreateModal);
}

if (listCreateForm && !listCreateForm._wired){
  listCreateForm._wired = true;
  listCreateForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const raw = (listCreateName?.value || '').trim();
    if (!raw){
      listCreateName?.focus();
      return;
    }

    const mode = listCreateModal?.dataset?.mode || "create";

    if (mode === "edit"){
      // --- Update bestehender Liste ---
      const listId = listCreateModal?.dataset?.listId;
      const list = state.lists.find(l => l.id === listId);
      if (list){
        list.name = raw;
        list.icon = _selectedListIcon || null;
        saveState();
        renderLists();
        renderItems();
      }
      closeListCreateModal();
      return;
    }

    // --- Neu erstellen (Default) ---
    const newList = {
      id: uid(),
      name: raw,
      items: [],
      icon: _selectedListIcon || null
    };
    state.lists.push(newList);
    state.selectedListId = newList.id;
    saveState();

    renderLists();
    renderItems();

    closeListCreateModal();
  });
}


if (listCreateCancelBtn && !listCreateCancelBtn._wired){
  listCreateCancelBtn._wired = true;
  listCreateCancelBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    closeListCreateModal();
  });
}

// ===== Bearbeiten einer Liste im "Neue Liste"-Modal =====
function hydrateListIconSelection(iconPath){
  if (!listIconGrid) return;
  // reset
  listIconGrid.querySelectorAll(".icon-tile").forEach(b=>{
    b.setAttribute("aria-pressed","false");
  });
  _selectedListIcon = iconPath || null;
  if (_selectedListIcon){
    const tile = listIconGrid.querySelector(`.icon-tile[data-icon="${CSS.escape(_selectedListIcon)}"]`);
    if (tile) tile.setAttribute("aria-pressed","true");
  }
}

function openListEditModal(listId){
  const list = state.lists.find(l => l.id === listId);
  if (!list || !listCreateModal || !listCreateForm || !listCreateName) return;

  // Modus & Ziel merken
  listCreateModal.dataset.mode = "edit";
  listCreateModal.dataset.listId = listId;

  // UI anpassen (Titel, Buttontext)
  const titleEl = document.getElementById("listCreateTitle");
  const submitBtn = document.getElementById("listCreateCreateBtn");
  if (titleEl)  titleEl.textContent = "Liste bearbeiten";
  if (submitBtn) submitBtn.textContent = "Speichern";

  // Felder befüllen
  listCreateForm.reset();
  listCreateName.value = list.name || "";
  hydrateListIconSelection(list.icon || null);

  // Öffnen + Fokus
  openModal(listCreateModal);
  requestAnimationFrame(() => listCreateName?.focus());
}

function resetListCreateModalMode(){
  if (!listCreateModal) return;
  delete listCreateModal.dataset.mode;
  delete listCreateModal.dataset.listId;

  // Texte auf "Neue Liste" zurücksetzen
  const titleEl = document.getElementById("listCreateTitle");
  const submitBtn = document.getElementById("listCreateCreateBtn");
  if (titleEl)  titleEl.textContent = "Neue Liste";
  if (submitBtn) submitBtn.textContent = "Erstellen";
}

function closeListCreateModal(){
  if (!listCreateModal) return;

  // Nach dem Schließen (wenn die Out-Animation fertig ist) zurücksetzen
  const dlg = listCreateModal.querySelector(".modal-dialog");
  const onDone = () => {
    resetListCreateModalMode();
    dlg?.removeEventListener("animationend", onDone);
  };

  if (dlg) {
    dlg.addEventListener("animationend", onDone, { once: true });
  } else {
    // Fallback ohne Animation
    resetListCreateModalMode();
  }

  // Modal jetzt schließen (führt die Out-Animation aus)
  closeModal(listCreateModal);
}



// ===== UI Events =====
if (addListBtn) addListBtn.addEventListener("click", ()=>{
  const mode = prefs?.ui?.listCreateMode === "modal" ? "modal" : "instant";

  if (mode === "modal"){
    // Öffne das „Neue Liste“-Modal
    openListCreateModal();
    return;
  }

  // Sofort erstellen (bisheriges Verhalten)
  const newList = { id: uid(), name: "Neue Liste", items: [] };
  state.lists.push(newList);
  state.selectedListId = newList.id;
  saveState();

  renderLists();              // nur Listen neu zeichnen
  startInlineRename(newList.id); // direkt in Inline-Rename springen
  renderItems();              // Items-Panel passend aktualisieren
});



if (addItemBtn) addItemBtn.addEventListener("click", ()=>{
  if (!getSelectedList()){ alert("Bitte zuerst links eine Liste anlegen oder auswählen."); return; }
  openItemModal("create");
});

// Suche & Filter triggern Re-Render
[searchInput, sortBy, statusFilter, dueFilter, prioFilter].forEach(el => {
  if (!el) return;
  const ev = el.tagName === "INPUT" ? "input" : "change";
  el.addEventListener(ev, ()=>{
    updateFilterActiveStates();
    renderItems();
  });
});


/* ===== Fancy Select: hübsche Listboxen für Filter ===== */
function initFancySelect(selectEl, options){
  if (!selectEl) return null;

  const wrap = document.createElement("div");
  wrap.className = "fs";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fs-btn pressable";
  btn.innerHTML = `<span class="fs-label"></span>
    <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
  const menu = document.createElement("ul");
  menu.className = "fs-menu"; menu.setAttribute("role","listbox");

  options.forEach(o=>{
    const li = document.createElement("li");
    li.textContent = o.label; li.dataset.value = o.value; li.tabIndex = 0;
    menu.appendChild(li);
  });

  const parent = selectEl.parentNode;
  parent.insertBefore(wrap, selectEl);
  wrap.appendChild(btn);
  wrap.appendChild(menu);
  wrap.appendChild(selectEl);
  selectEl.classList.add("visually-hidden");

  function updateLabel(){
    const curr = options.find(o=>o.value===selectEl.value) || options[0];
    wrap.querySelector(".fs-label").textContent = curr.label;
    [...menu.children].forEach(li => li.classList.toggle("selected", li.dataset.value === selectEl.value));
  }
  function open(){ wrap.classList.add("open"); }
  function close(){ wrap.classList.remove("open"); }
  function setValue(val){
    if (selectEl.value === val) { close(); return; }
    selectEl.value = val;
    selectEl.dispatchEvent(new Event("change", { bubbles:true }));
    updateLabel(); close();
  }

  btn.addEventListener("click", ()=> wrap.classList.toggle("open"));
  menu.addEventListener("click", (e)=>{
    const li = e.target.closest("li"); if (!li) return;
    setValue(li.dataset.value);
  });
  document.addEventListener("click", (e)=>{ if (!wrap.contains(e.target)) close(); });

  btn.addEventListener("keydown", (e)=>{
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " "){
      e.preventDefault(); open();
      (menu.querySelector(".selected") || menu.firstElementChild)?.focus();
    }
  });
  menu.addEventListener("keydown", (e)=>{
    const items = [...menu.children];
    let idx = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown"){ e.preventDefault(); items[Math.min(idx+1, items.length-1)].focus(); }
    else if (e.key === "ArrowUp"){ e.preventDefault(); items[Math.max(idx-1, 0)].focus(); }
    else if (e.key === "Enter"){ e.preventDefault(); const val = document.activeElement?.dataset.value; if (val) setValue(val); }
    else if (e.key === "Escape"){ e.preventDefault(); close(); btn.focus(); }
  });

  updateLabel();
  return { update: updateLabel, open, close, wrap };
  
}
initFancySelect(sortBy, [
  { value:"none",   label:"Sortierung: Aus" }, // NEU
  { value:"due",    label:"Fälligkeit" },
  { value:"status", label:"Status" },
  { value:"prio",   label:"Priorität" },
  { value:"title",  label:"A–Z (Titel)" },
]);

initFancySelect(statusFilter, [
  { value:"all",   label:"Status: Alle" },
  { value:"open",  label:"Nur offen" },
  { value:"done",  label:"Nur erledigt" },
]);
initFancySelect(dueFilter, [
  { value:"all",     label:"Fälligkeit: Alle" },
  { value:"today",   label:"Heute" },
  { value:"overdue", label:"Überfällig" },
]);
initFancySelect(prioFilter, [
  { value:"all",  label:"Priorität: Alle" },
  { value:"low",  label:"Niedrig" },
  { value:"med",  label:"Mittel" },
  { value:"high", label:"Dringend" },
]);

// …nach initFancySelect(...) Aufrufen:
updateFilterActiveStates();

// dann wie gehabt:
applyPrefs();
render();


function updateFilterActiveStates(){
  const mark = (el, active) => {
    if (!el) return;
    const wrap = el.closest?.(".fs") || el.parentElement;
    if (wrap) wrap.classList.toggle("active", !!active);
  };

  // "all" = Standard → nicht aktiv
  mark(statusFilter, statusFilter && statusFilter.value !== "all");
  mark(dueFilter,    dueFilter    && dueFilter.value    !== "all");
  mark(prioFilter,   prioFilter   && prioFilter.value   !== "all");

  if (searchInput){
    const on = !!searchInput.value.trim();
    searchInput.classList.toggle("is-active", on);
  }
}


// ===== First run =====
if (!Array.isArray(state.lists) || state.lists.length === 0){
  const demo = { id: uid(), name: "Liste 1", items: [] };
  state.lists = [demo];
  state.selectedListId = demo.id;
  saveState();
} else {
  // Falls selectedListId fehlt/ungültig, erste Liste wählen
  if (!state.selectedListId || !getSelectedList()){
    state.selectedListId = state.lists[0].id;
    saveState();
  }
}

// ==== Notebook-Öffnungspräferenz ====
// Standard: gleicher Tab (false) – falls noch nicht vorhanden
if (typeof prefs.openNotebookInNewTab !== "boolean"){
  prefs.openNotebookInNewTab = false;
  savePrefs && savePrefs();
}

// Sidebar-Button → Notizbuch öffnen
const openNotebookBtn = q("#openNotebookBtn");

if (openNotebookBtn && !openNotebookBtn._wired){
  openNotebookBtn._wired = true;
  openNotebookBtn.addEventListener("click", ()=>{
    // Drawer schließen, kleine Verzögerung für weiche UX
    closeDrawer?.();
    const target = (prefs.ui.nbOpen === "new") ? "_blank" : "_self";
    // Passe ggf. den Pfad an, falls deine Notebook-Seite anders heißt
    window.open("notebook.html", target);
  });
}


if (openNotebookBtn){
  openNotebookBtn.addEventListener("click", ()=>{
    const target = prefs.openNotebookInNewTab ? "_blank" : "_self";
    window.open("notebook.html", target);
  });
}

// Einstellungen-UI für Öffnungsmodus
const openNotebookSegment = q("#openNotebookSegment");
function markOpenNotebookMode(){
  if (!openNotebookSegment) return;
  [...openNotebookSegment.querySelectorAll(".seg-btn")].forEach(b=>{
    const active = (prefs.openNotebookInNewTab && b.dataset.open==="new")
                || (!prefs.openNotebookInNewTab && b.dataset.open==="same");
    b.classList.toggle("active", active);
  });
}
if (openNotebookSegment){
  openNotebookSegment.addEventListener("click", (e)=>{
    const b = e.target.closest(".seg-btn"); if (!b) return;
    prefs.openNotebookInNewTab = (b.dataset.open === "new");
    markOpenNotebookMode();
    savePrefs && savePrefs();
  });

  // Wenn Settings geöffnet werden, UI hydrieren
  if (typeof openSettingsBtn !== "undefined" && openSettingsBtn){
    openSettingsBtn.addEventListener("click", ()=> setTimeout(markOpenNotebookMode, 10));
  }
  if (typeof openSettingsTop !== "undefined" && openSettingsTop){
    openSettingsTop.addEventListener("click", ()=> setTimeout(markOpenNotebookMode, 10));
  }
}


// Apply prefs + initial render

applyPrefs();
renderProfileBadge();
maybeShowProfileOnFirstRun();
// ===== App Init (mit Auth-Guard & Remote-Load) =====
(async function init(){
  try{
    // Wenn nicht eingeloggt → zur Login-Seite
    const usr = await getSessionUser();
    if (!usr){
      window.location.href = "login.html";
      return;
    }

    await refreshAuthUI();      // zeigt Logout-Button & Badge
    await loadStateFromRemote(); // lädt nutzerbezogenen State
    applyPrefs();               // Themes, UI
    render();                   // gesamte UI
    maybeShowProfileOnFirstRun();
    initSidebarToggle();
  } catch(e){
    console.error(e);
    // Fallback: Wenigstens UI bauen
    applyPrefs();
    render();
  }
})();

