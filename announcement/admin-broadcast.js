// announcement/admin-broadcast.js
// Admin-UI: Button "Meldungen" + Dialog zum Senden

import { sb } from "../shared/supabase.js";
import { previewAnnouncement } from "./announcement-client.js";


const SB_READY_EVENT = "sb-ready";
let sbReadyPromise = null;

function waitForSBReady() {
  if (window.__SB_READY__) return Promise.resolve();
  if (!sbReadyPromise) {
    sbReadyPromise = new Promise((resolve) => {
      window.addEventListener(SB_READY_EVENT, () => resolve(), { once: true });
    });
  }
  return sbReadyPromise;
}

async function isCurrentUserAdmin() {
  const user = window.__SB_USER__;
  if (!user) return false;

  try {
    const { data, error } = await sb
      .from("users")
      .select("is_admin")
      .eq("user_id", user.id)   // deine PK-Spalte heißt user_id
      .maybeSingle();

    if (error) {
      console.error("[AdminCheck] Fehler beim Laden der Rolle:", error);
      return false;
    }
    return data?.is_admin === true;
  } catch (err) {
    console.error("[AdminCheck] Unerwarteter Fehler:", err);
    return false;
  }
}

let adminUIInitialised = false;

export async function setupAdminAnnouncementUI() {
  await waitForSBReady();
  if (adminUIInitialised) return;
  adminUIInitialised = true;

  if (!window.__SB_USER__) return;

const adminSection = document.getElementById("adminSection");
const trigger = document.getElementById("adminPanelBtn");
const previewTrigger = document.getElementById("adminPreviewBtn");
if (adminSection) adminSection.hidden = true;
if (trigger) trigger.hidden = true;
if (previewTrigger) previewTrigger.hidden = true;


const isAdmin = await isCurrentUserAdmin();

// ❗ Nicht-Admin → ALLES sicher verstecken
if (!isAdmin) {
  if (adminSection) adminSection.hidden = true;
  if (trigger) trigger.hidden = true;
  if (previewTrigger) previewTrigger.hidden = true;
  return;
}

// ✅ Admin → sichtbar machen
if (adminSection) adminSection.hidden = false;
if (trigger) trigger.hidden = false;
if (previewTrigger) previewTrigger.hidden = false;




// Admin-Modal
const overlay = document.createElement("div");
overlay.classList.add("modal");
overlay.id = "adminBroadcastModal";
overlay.setAttribute("aria-hidden", "true");

const content = document.createElement("div");
content.classList.add("modal__content");

const header = document.createElement("div");
header.classList.add("modal__header");

const title = document.createElement("h2");
title.textContent = "Broadcast senden";

// Close Button wie in index.html
const closeBtn = document.createElement("button");
closeBtn.classList.add("modal__close");
closeBtn.setAttribute("aria-label", "Schließen");
closeBtn.setAttribute("data-close", "");
closeBtn.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
`;

header.appendChild(title);
header.appendChild(closeBtn);

// ✅ WICHTIG: form + footer VOR appendChild(form) erstellen
const form = document.createElement("div");
form.classList.add("ann-form");

const labelTitle = document.createElement("label");
labelTitle.classList.add("ann-field");
labelTitle.innerHTML = `
  <span class="ann-field__label">Titel</span>
  <input class="ann-input" type="text" placeholder="z.B. Wartung, Info, Update …">
`;

const labelTarget = document.createElement("label");
labelTarget.classList.add("ann-field");
labelTarget.innerHTML = `
  <span class="ann-field__label">Empfänger (optional)</span>
  <input class="ann-input" type="text" placeholder="leer = alle | Konto-ID oder User-UUID">
`;

const labelBody = document.createElement("label");
labelBody.classList.add("ann-field");
labelBody.innerHTML = `
  <span class="ann-field__label">Nachricht</span>
  <textarea class="ann-textarea" rows="4" placeholder="Was sollen alle gerade eingeloggten Nutzer sehen?"></textarea>
`;

form.appendChild(labelTitle);
form.appendChild(labelTarget);
form.appendChild(labelBody);

const footer = document.createElement("div");
footer.classList.add("ann-card__footer");

const cancelBtn = document.createElement("button");
cancelBtn.type = "button";
cancelBtn.classList.add("ann-btn", "ann-btn--ghost", "pressable");
cancelBtn.textContent = "Abbrechen";

const pushBtn = document.createElement("button");
pushBtn.type = "button";
pushBtn.classList.add("ann-btn", "ann-btn--primary", "pressable");
pushBtn.textContent = "Push an alle";

footer.appendChild(cancelBtn);
footer.appendChild(pushBtn);

// zusammenbauen
content.appendChild(header);
content.appendChild(form);
content.appendChild(footer);

overlay.appendChild(content);
document.body.appendChild(overlay);



// Vorschau-Modal 
const previewOverlay = document.createElement("div");
previewOverlay.classList.add("modal");
previewOverlay.id = "adminPreviewModal";
previewOverlay.setAttribute("aria-hidden", "true");

const previewContent = document.createElement("div");
previewContent.classList.add("modal__content");

const previewHeader = document.createElement("div");
previewHeader.classList.add("modal__header");

const previewTitle = document.createElement("h2");
previewTitle.textContent = "Vorschau (User-Modal)";

const previewCloseX = document.createElement("button");
previewCloseX.classList.add("modal__close");
previewCloseX.setAttribute("aria-label", "Schließen");
previewCloseX.setAttribute("data-close", "");
previewCloseX.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
`;

previewHeader.appendChild(previewTitle);
previewHeader.appendChild(previewCloseX);

// previewBody
const previewBody = document.createElement("div");
previewBody.innerHTML = `
  <p class="ann-preview__hint">
    Hier kannst du bestehende Broadcasts ansehen oder User-Modals live testen.
  </p>

  <div class="ann-tabs" role="tablist" aria-label="Vorschau Tabs">
    <button type="button" class="ann-tab is-active" id="annTabBroadcasts" role="tab" aria-selected="true">
      Broadcasts
    </button>
    <button type="button" class="ann-tab" id="annTabModals" role="tab" aria-selected="false">
      Modals
    </button>
  </div>

  <div id="annPanelBroadcasts" class="ann-tabpanel is-active" role="tabpanel" aria-labelledby="annTabBroadcasts">
    <div class="ann-preview__list-wrap">
      <ul class="ann-preview__list" id="annPreviewList"></ul>
      <div class="ann-preview__empty" id="annPreviewEmpty" hidden>Keine Meldungen vorhanden.</div>
    </div>
  </div>

  <div id="annPanelModals" class="ann-tabpanel" role="tabpanel" aria-labelledby="annTabModals">
    <div class="ann-preview__list-wrap">
      <ul class="ann-preview__list" id="annModalsPreviewList"></ul>
      <div class="ann-preview__empty" id="annModalsPreviewEmpty" hidden>Keine Modals vorhanden.</div>
    </div>
  </div>

  <div class="ann-card__footer">
    <button type="button" class="ann-btn ann-btn--ghost pressable" id="annPreviewCloseBtn">
      Schließen
    </button>
  </div>
`;


previewContent.appendChild(previewHeader);
previewContent.appendChild(previewBody);
previewOverlay.appendChild(previewContent);
document.body.appendChild(previewOverlay);


const previewListEl = previewBody.querySelector("#annPreviewList");
const previewEmptyEl = previewBody.querySelector("#annPreviewEmpty");
const previewCloseBtn = previewBody.querySelector("#annPreviewCloseBtn");
// Tabs + Panels
const tabBroadcastsBtn = previewBody.querySelector("#annTabBroadcasts");
const tabModalsBtn     = previewBody.querySelector("#annTabModals");
const panelBroadcasts  = previewBody.querySelector("#annPanelBroadcasts");
const panelModals      = previewBody.querySelector("#annPanelModals");

// Modals-Liste
const modalsListEl  = previewBody.querySelector("#annModalsPreviewList");
const modalsEmptyEl = previewBody.querySelector("#annModalsPreviewEmpty");


function openPreviewModal() {
  previewOverlay.classList.add("open");
  previewOverlay.setAttribute("aria-hidden", "false");

  setPreviewTab("broadcasts");
  loadPreviewAnnouncements().catch(console.error);
  renderModalsList();
}

function closePreviewModal() {
  previewOverlay.classList.remove("open");
  previewOverlay.setAttribute("aria-hidden", "true");

  const root = _chatPreviewRoot;
  if (root) root.classList.remove("is-open");
}



function setPreviewTab(which) {
  const isBroadcasts = which === "broadcasts";

  tabBroadcastsBtn?.classList.toggle("is-active", isBroadcasts);
  tabModalsBtn?.classList.toggle("is-active", !isBroadcasts);

  tabBroadcastsBtn?.setAttribute("aria-selected", isBroadcasts ? "true" : "false");
  tabModalsBtn?.setAttribute("aria-selected", !isBroadcasts ? "true" : "false");

  panelBroadcasts?.classList.toggle("is-active", isBroadcasts);
  panelModals?.classList.toggle("is-active", !isBroadcasts);

  // optional: beim Wechsel Inhalte laden
  if (!isBroadcasts) renderModalsList();
}

tabBroadcastsBtn?.addEventListener("click", () => setPreviewTab("broadcasts"));
tabModalsBtn?.addEventListener("click", () => setPreviewTab("modals"));


// Klick auf Sidebar-Button öffnet Vorschau
previewTrigger?.addEventListener("click", openPreviewModal);

// Backdrop klick schließt
previewCloseBtn?.addEventListener("click", closePreviewModal);
previewCloseX.addEventListener("click", closePreviewModal);

previewOverlay.addEventListener("click", (ev) => {
  if (ev.target === previewOverlay) closePreviewModal();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && previewOverlay.classList.contains("open")) {
    closePreviewModal();
  }
});


async function loadPreviewAnnouncements() {
  if (!previewListEl) return;
  previewListEl.innerHTML = "";

  const { data, error } = await sb
    .from("announcements")
    .select("id,title,body,created_at,target_user_id")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[Preview] Laden fehlgeschlagen:", error);
    if (previewEmptyEl) {
      previewEmptyEl.hidden = false;
      previewEmptyEl.textContent = "Fehler beim Laden der Meldungen.";
    }
    return;
  }

  const anns = data ?? [];

  if (!anns.length) {
    if (previewEmptyEl) previewEmptyEl.hidden = false;
    return;
  }
  if (previewEmptyEl) previewEmptyEl.hidden = true;

  anns.forEach((ann) => {
    const li = document.createElement("li");
    li.className = "ann-preview__item";

    const created = ann.created_at ? new Date(ann.created_at).toLocaleString() : "";
    const scope = ann.target_user_id ? "Ziel: 1 User" : "Global";

    li.innerHTML = `
      <div class="ann-preview__meta">
        <div class="ann-preview__title">${escapeHtml((ann.title || "Meldung").trim())}</div>
        <div class="ann-preview__sub">${escapeHtml(scope)} · ${escapeHtml(created)}</div>
      </div>
      <button type="button" class="ann-btn ann-btn--primary pressable" data-preview="1">
        Anzeigen
      </button>
    `;

    li.querySelector('[data-preview="1"]')?.addEventListener("click", () => {
      // zeigt das User-Modal an (ohne "seen" zu schreiben)
      previewAnnouncement({
        title: ann.title || "Meldung",
        body: ann.body || ""
      });
    });

    previewListEl.appendChild(li);
  });
}

function renderModalsList() {
  if (!modalsListEl) return;

  modalsListEl.innerHTML = "";

  // Aktuell nur 1 Eintrag: Wiederherstellungsschlüssel
  const li = document.createElement("li");
  li.className = "ann-preview__item";

  li.innerHTML = `
    <div class="ann-preview__meta">
      <div class="ann-preview__title">Wiederherstellungsschlüssel</div>
      <div class="ann-preview__sub">Chat · Recovery-Key Setup Modal</div>
    </div>
    <button type="button" class="ann-btn ann-btn--primary pressable" data-open-recovery="1">
      Anzeigen
    </button>
  `;

  li.querySelector('[data-open-recovery="1"]')?.addEventListener("click", () => {
    openLiveChatModalPreview("recoveryModal");

  });

  modalsListEl.appendChild(li);

  if (modalsEmptyEl) modalsEmptyEl.hidden = true;
}

/* ===========================
   LIVE Preview: Chat-Modals aus Chat/chat.html laden
=========================== */

const CHAT_HTML_URL = new URL("../Chat/chat.html", import.meta.url).toString();
const CHAT_CSS_URL  = new URL("../Chat/chat.css", import.meta.url).toString();

let _chatHtmlCache = null; // string

let _chatCssInjected = false;

async function ensureChatCssLoaded() {
  if (_chatCssInjected) return;

  const res = await fetch(CHAT_CSS_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Chat CSS konnte nicht geladen werden (${res.status})`);
  }
  const css = await res.text();

  // CSS scopen: alles nur innerhalb .chat-preview-scope wirken lassen
  const scoped = scopeChatCss(css, ".chat-preview-scope");

  const style = document.createElement("style");
  style.setAttribute("data-chat-preview-css", "1");
  style.textContent = scoped;
  document.head.appendChild(style);

  _chatCssInjected = true;
}

function scopeChatCss(cssText, scopeSel) {
  let css = cssText;

  // 1) :root und html/body Regeln auf den Scope umbiegen
  css = css.replace(/:root\b/g, scopeSel);
  css = css.replace(/\bhtml,\s*body\b/g, scopeSel);
  css = css.replace(/\bbody\b/g, scopeSel);

  // 2) [data-theme="light"] etc. sollen auf den Scope gehen (Scope bekommt data-theme)
  css = css.replace(/\[data-theme="light"\]/g, `${scopeSel}[data-theme="light"]`);
  css = css.replace(/\[data-theme="dark"\]/g, `${scopeSel}[data-theme="dark"]`);

  // 3) Globales *{...} scopen
  css = css.replace(/(^|}|;)\s*\*\s*\{/g, `$1 ${scopeSel} *{`);

  // 4) @import kann global bleiben; ist ok. (Fonts)
  return css;
}


async function fetchChatHtmlOnce() {
  const res = await fetch(CHAT_HTML_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Chat HTML konnte nicht geladen werden (${res.status})`);
  }
  return await res.text();
}

let _chatPreviewRoot = null;

function getChatPreviewRoot() {
  if (_chatPreviewRoot) return _chatPreviewRoot;

  const root = document.createElement("div");
  root.className = "chat-preview-scope";

  // Theme von der Overview übernehmen
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  root.setAttribute("data-theme", theme);

  document.body.appendChild(root);
  _chatPreviewRoot = root;
  return root;
}

async function mountChatModalFromHtml(modalId) {
  // schon im DOM (im Preview-Root)?
  const existing = document.getElementById(modalId);
  if (existing) return existing;

  const html = await fetchChatHtmlOnce();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const modal = doc.getElementById(modalId);

  if (!modal) {
    throw new Error(`Modal #${modalId} nicht in Chat/chat.html gefunden`);
  }

  // Modal importieren und in den scoped Root hängen
  const el = document.importNode(modal, true);
  getChatPreviewRoot().appendChild(el);

  return el;
}


function wireRecoveryModalBehavior(modalEl) {
  // IDs wie im echten Chat
  const keyEl  = modalEl.querySelector("#recoveryKeyDisplay");
  const cb     = modalEl.querySelector("#recoveryConfirm");
  const doneBtn= modalEl.querySelector("#recoveryDoneBtn");
  const backdrop = modalEl.querySelector(".chat-modal-backdrop");

  if (!keyEl || !cb || !doneBtn || !backdrop) return;

  // vorhandene Listener vermeiden (falls Preview mehrfach geöffnet wird)
  if (modalEl._previewWired) return;
  modalEl._previewWired = true;

  const onChange = () => {
    doneBtn.disabled = !cb.checked;
  };
  cb.addEventListener("change", onChange);

  const close = () => {
    modalEl.classList.remove("open");
    modalEl.setAttribute("aria-hidden", "true");
    cb.checked = false;
    doneBtn.disabled = true;

    // Wenn kein Preview-Modal mehr offen ist -> Scope wieder verstecken
    const root = getChatPreviewRoot();
    const anyOpen = root.querySelector(".chat-modal.open");
    if (!anyOpen) root.classList.remove("is-open");
  };


  // Backdrop click schließt
  backdrop.addEventListener("click", close);

  // "Fertig" schließt
  doneBtn.addEventListener("click", close);

  // ESC schließt (nur wenn offen)
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modalEl.classList.contains("open")) close();
  });
}

async function openLiveChatModalPreview(modalId) {
  try {
    // 1) chat.css laden (damit es 1:1 aussieht)
    await ensureChatCssLoaded();
    getChatPreviewRoot().classList.add("is-open");


    // 2) modal live aus chat.html mounten
    const modalEl = await mountChatModalFromHtml(modalId);

    // 3) falls Recovery: Platzhalter setzen + Verhalten wie im Chat nachbauen
    if (modalId === "recoveryModal") {
      const keyEl  = modalEl.querySelector("#recoveryKeyDisplay");
      const cb     = modalEl.querySelector("#recoveryConfirm");
      const doneBtn= modalEl.querySelector("#recoveryDoneBtn");

      if (keyEl) {
        keyEl.textContent =
          "49a77a75cd735f54373732eb1e2fb8027cdb58b4bbaca0a9678126193297d9c1";
      }
      if (cb) cb.checked = false;
      if (doneBtn) doneBtn.disabled = true;

      wireRecoveryModalBehavior(modalEl);
    }

    // 4) öffnen
    modalEl.classList.add("open");
    modalEl.setAttribute("aria-hidden", "false");
  } catch (e) {
    console.error("[PreviewModals] Fehler:", e);
    alert("Modal-Vorschau konnte nicht geladen werden. Details in Konsole.");
  }
}


let recoveryPreviewEl = null;

function openRecoveryPreviewModal() {
  const placeholderKey =
    "49a77a75cd735f54373732eb1e2fb8027cdb58b4bbaca0a9678126193297d9c1";

  if (!recoveryPreviewEl) {
    // Wrapper wie im Chat: .chat-modal
    const modal = document.createElement("div");
    modal.className = "chat-modal ann-recovery-preview";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="chat-modal-backdrop"></div>

      <div class="chat-modal-dialog" role="dialog" aria-modal="true">
        <div class="chat-modal-head">
          <h2>Wiederherstellungsschlüssel</h2>
        </div>

        <div class="chat-modal-body">
          <p>
            Dies ist dein persönlicher Wiederherstellungsschlüssel für die Ende-zu-Ende-Verschlüsselung.
            <strong>Wir können diesen Schlüssel nicht für dich speichern oder wiederherstellen.</strong><br>
            Schreibe ihn auf und bewahre ihn an einem sicheren Ort auf. Ohne diesen Schlüssel
            können deine verschlüsselten Chats nach einem Geräte- oder Browserwechsel
            nicht wiederhergestellt werden.
          </p>

          <pre id="recoveryKeyDisplayPreview" class="recovery-key"></pre>

          <label class="recovery-checkbox">
            <input type="checkbox" id="recoveryConfirmPreview" />
            Ich habe den Schlüssel sicher notiert.
          </label>

          <button type="button" id="recoveryDoneBtnPreview" disabled>Fertig</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    recoveryPreviewEl = modal;

    const keyEl = modal.querySelector("#recoveryKeyDisplayPreview");
    const cb = modal.querySelector("#recoveryConfirmPreview");
    const doneBtn = modal.querySelector("#recoveryDoneBtnPreview");
    const backdrop = modal.querySelector(".chat-modal-backdrop");

    // Checkbox aktiviert "Fertig" (wie echt)
    cb.addEventListener("change", () => {
      doneBtn.disabled = !cb.checked;
    });

    // Close
    function close() {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      cb.checked = false;
      doneBtn.disabled = true;
    }

    doneBtn.addEventListener("click", close);
    backdrop.addEventListener("click", close);

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && modal.classList.contains("open")) close();
    });

    // initial placeholder setzen
    keyEl.textContent = placeholderKey;
  } else {
    // placeholder ggf. immer wieder setzen
    const keyEl = recoveryPreviewEl.querySelector("#recoveryKeyDisplayPreview");
    if (keyEl) keyEl.textContent = placeholderKey;
  }

  recoveryPreviewEl.classList.add("open");
  recoveryPreviewEl.setAttribute("aria-hidden", "false");
}




// kleine HTML-Escape Hilfe
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}


const inputTitle = labelTitle.querySelector("input");
const inputTarget = labelTarget.querySelector("input");
const textarea = labelBody.querySelector("textarea");


  function openModal() {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    inputTitle.focus();
  }

  function closeModal() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }


  trigger.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);

  // Klick auf Backdrop schließt
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeModal();
  });

  // ESC schließt
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && overlay.classList.contains("open")) {
      closeModal();
    }
  });


  async function resolveTargetUserId(raw) {
  if (!raw) return null;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) return raw;

  // Konto-ID -> user_id auflösen (du hast das RPC bereits in overview.js)
  const { data, error } = await sb.rpc("resolve_user_by_account_id", { account_id: raw });
  if (error) throw new Error("Konto-ID konnte nicht geprüft werden: " + error.message);
  if (!data) throw new Error("Konto-ID nicht gefunden.");
  return data;
}


  async function sendBroadcast() {
    const titleVal = inputTitle.value.trim();
    const bodyVal = textarea.value.trim();
    const targetRaw = (inputTarget?.value || "").trim();

    if (!titleVal || !bodyVal) {
      alert("Bitte Titel und Nachricht ausfüllen.");
      return;
    }


    pushBtn.disabled = true;
    pushBtn.textContent = "Senden…";

    try {
      const user = window.__SB_USER__;
      let targetUserId = null;
      try {
        targetUserId = await resolveTargetUserId(targetRaw);
      } catch (e) {
        alert(e.message);
        return;
      }

      const { error } = await sb.from("announcements").insert({
        title: titleVal,
        body: bodyVal,
        created_by: user?.id ?? null,
        target_user_id: targetUserId, // null => alle
      });


      if (error) {
        console.error("[Broadcast] Fehler beim Senden:", error);
        alert("Senden fehlgeschlagen. Siehe Konsole für Details.");
      } else {
        inputTitle.value = "";
        if (inputTarget) inputTarget.value = "";
        textarea.value = "";
        closeModal();
      }
    } catch (err) {
      console.error("[Broadcast] Unerwarteter Fehler:", err);
      alert("Unerwarteter Fehler beim Senden. Siehe Konsole.");
    } finally {
      pushBtn.disabled = false;
      pushBtn.textContent = "Push an alle";
    }
  }

  pushBtn.addEventListener("click", sendBroadcast);
  textarea.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      sendBroadcast();
    }
  });
}
