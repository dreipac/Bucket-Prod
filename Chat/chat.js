// chat.js
import "../shared/supabase.js";
import { initAnnouncementListener } from "../announcement/announcement-client.js";

// Auf Supabase warten
const waitForSB = () =>
  new Promise((resolve) => {
    if (window.__SB_READY__) return resolve();
    window.addEventListener("sb-ready", resolve, { once: true });
  });

await waitForSB();

if (!window.__SB_USER__) {
  const returnTo = encodeURIComponent("/Chat/chat.html");
  location.replace(`../login/login.html?returnTo=${returnTo}`);
  throw new Error("Kein User – Redirect zu Login");
}

// Broadcast-Meldungen für Chat aktivieren
initAnnouncementListener().catch(console.error);

// >>> darunter bleibt dein bisheriger Chat-Code unverändert


const sb = window.sb;
const me = window.__SB_USER__.id;

// DOM
const contactList = document.getElementById("contactList");
const messageList = document.getElementById("messageList");
const composer = document.getElementById("composer");
const input = document.getElementById("messageInput");
const titleEl = document.getElementById("activeChatName");

const newChatBtn   = document.getElementById("newChatBtn");
const newChatModal = document.getElementById("newChatModal");
const newChatList  = document.getElementById("newChatList");
const newChatClose = document.getElementById("newChatClose");
const newChatEmpty = document.getElementById("newChatEmpty");
// NEU: Einstellungen / Theme
const settingsBtn      = document.getElementById("settingsBtn");
const settingsModal    = document.getElementById("settingsModal");
const settingsClose    = document.getElementById("settingsClose");
const themeOptions     = document.querySelectorAll(".settings-theme-option");


const searchInput   = document.getElementById("chatRecipientInput");
const searchResults = document.getElementById("chatRecipientResults");
const searchBox     = document.querySelector(".chat-recipient");

let contactDirectory = [];  // { id, first_name, last_name, avatar_url }




let activePeerId = null;
let subscription = null;
let peersWithChats = new Set();

// Duplikate vermeiden (optimistisch + Realtime)
const renderedKeys = new Set();
function makeKey(msg) {
  // Bevorzugt echte DB-ID, sonst stabiler Fallback
  return msg.id ?? `${msg.sender_id}|${msg.receiver_id}|${msg.text}|${msg.created_at}`;
}


/* ---------- Kontakte / Chats ---------- */

async function getUserProfile(uid) {
  const { data, error } = await sb
    .from("users")
    .select("first_name, last_name, avatar_url")
    .eq("user_id", uid)
    .single();

  if (error) {
    console.warn("Profil konnte nicht geladen werden:", error);
    return { first_name: "Unbekannter", last_name: "Kontakt", avatar_url: null };
  }
  return data;
}

// sorgt dafür, dass ein Eintrag in der Chat-Liste existiert
async function ensureChatEntry(peerId) {
  if (!peerId) return;

  // existiert schon?
  const existing = contactList.querySelector(`li[data-peer="${peerId}"]`);
  if (existing) return;

  const profile = await getUserProfile(peerId);

  const li = document.createElement("li");
  li.dataset.peer = peerId;
  li.classList.add("pressable");

  li.innerHTML = `
    <div class="chat-contact">
      <img class="chat-contact-avatar" src="${profile.avatar_url ?? '../assets/icons/default-avatar.png'}" alt="">
      <span class="chat-contact-name">
        ${profile.first_name ?? ''} ${profile.last_name ?? ''}
      </span>
    </div>
  `;

  contactList.appendChild(li);
}

// lädt NUR Personen, mit denen es schon Nachrichten gibt
async function loadContacts() {
  peersWithChats = new Set();
  contactList.innerHTML = "";

  const { data: msgs, error } = await sb
    .from("messages")
    .select("sender_id, receiver_id, created_at")
    .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Chats konnten nicht geladen werden:", error);
    return;
  }

  for (const row of (msgs ?? [])) {
    const peerId = row.sender_id === me ? row.receiver_id : row.sender_id;
    if (!peerId || peersWithChats.has(peerId)) continue;

    peersWithChats.add(peerId);
    await ensureChatEntry(peerId);
  }
}


/* ---------- Chat Auswahl ---------- */

contactList.addEventListener("click", async (e) => {
  const li = e.target.closest("li");
  if (!li) return;

  const peerId = li.dataset.peer;
  if (!peerId) return;

  await openChat(peerId);
});

async function openChat(peerId) {
  activePeerId = peerId;
  // Aktiven Chat in der Liste markieren
  [...contactList.querySelectorAll("li")].forEach(li => {
    li.classList.toggle("active", li.dataset.peer === peerId);
  });
  const profile = await getUserProfile(peerId);
  titleEl.innerHTML = `
  <img src="${profile.avatar_url ?? '../assets/icons/default-avatar.png'}" class="chat-title-avatar">
  <span>${profile.first_name} ${profile.last_name}</span>
`;


  messageList.innerHTML = "";
  renderedKeys.clear(); // <- NEU: Duplikat-Set pro Chat zurücksetzen


  // Alte Realtime unsub
  if (subscription) {
    sb.removeChannel(subscription);
    subscription = null;
  }

  // Historie laden
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${me},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${me})`)
    .order("created_at", { ascending: true });

  if (error) return alert("Fehler beim Laden der Nachrichten: " + error.message);
  (data ?? []).forEach(renderMessage);
  updateReadIndicators();

  // alle eingehenden Nachrichten dieses Kontakts als gelesen markieren
  const now = new Date().toISOString();
  const { error: readErr } = await sb
    .from("messages")
    .update({ read_at: now })
    .eq("receiver_id", me)
    .eq("sender_id", peerId)
    .is("read_at", null);  // nur ungelesene

  if (readErr) {
    console.warn("Lesebestätigungen konnten nicht aktualisiert werden:", readErr);
  }

  // Realtime-Subscription: Inserts + Updates
  subscription = sb
    .channel("room:" + [me, peerId].sort().join("-"))
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload.new;
        const isBetween =
          (msg.sender_id === me && msg.receiver_id === peerId) ||
          (msg.sender_id === peerId && msg.receiver_id === me);

        if (!isBetween) return;

        // Nachricht im UI anzeigen
        renderMessage(msg);

        // Wenn ICH der Empfänger bin und der Chat offen ist:
        // sofort als gelesen markieren -> triggert UPDATE beim Sender
        markAsReadIfVisible(msg);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload.new;
        const isBetween =
          (msg.sender_id === me && msg.receiver_id === peerId) ||
          (msg.sender_id === peerId && msg.receiver_id === me);
        if (isBetween) applyMessageUpdate(msg);
      }
    )
    .subscribe();



}

/* ---------- Neuer Chat über Suchfeld im Header ---------- */

// Alle bestätigten Kontakte einmal vorladen
async function preloadContactDirectory() {
  if (contactDirectory.length) return;

  const { data, error } = await sb.rpc("get_contacts_for_user", { uid: me });
  if (error) {
    console.error("Kontakte für Suche konnten nicht geladen werden:", error);
    return;
  }

  const ids = data ?? [];
  // Profile parallel laden
  const profiles = await Promise.all(ids.map((uid) => getUserProfile(uid)));

  contactDirectory = ids.map((id, idx) => ({
    id,
    ...profiles[idx],
  }));
}

// Hilfsfunktion: Vorschläge rendern
function renderSearchResults(matches) {
  if (!searchResults) return;

  searchResults.innerHTML = "";

  if (!matches.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Kein Kontakt gefunden.";
    searchResults.appendChild(li);
    searchResults.hidden = false;
    return;
  }

  for (const c of matches) {
    const li = document.createElement("li");
    li.dataset.peer = c.id;
    li.innerHTML = `
      <img src="${c.avatar_url ?? '../assets/icons/default-avatar.png'}" alt="">
      <span>${(c.first_name ?? '')} ${(c.last_name ?? '')}</span>
    `;
    searchResults.appendChild(li);
  }

  searchResults.hidden = false;
}

function clearSearchResults() {
  if (!searchResults) return;
  searchResults.hidden = true;
  searchResults.innerHTML = "";
}

// Chat mit ausgewähltem Kontakt starten
async function startChatWith(peerId) {
  if (!peerId) return;
  peersWithChats.add(peerId);
  await ensureChatEntry(peerId);
  await openChat(peerId);
  if (searchInput) searchInput.value = "";
  clearSearchResults();

    if (searchBox) {
    searchBox.classList.remove("is-visible");
  }
}

// Eingabe im Suchfeld
if (searchInput && !searchInput._wired) {
  searchInput._wired = true;
  searchInput.addEventListener("input", async (e) => {
    const term = e.target.value.trim().toLowerCase();
    if (!term) {
      clearSearchResults();
      return;
    }

    await preloadContactDirectory();

    const matches = contactDirectory
      .filter((c) => {
        const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        return full.includes(term);
      })
      .slice(0, 8); // max. 8 Vorschläge

    renderSearchResults(matches);
  });
}

// Klick auf einen Vorschlag
if (searchResults && !searchResults._wired) {
  searchResults._wired = true;
  searchResults.addEventListener("click", async (e) => {
    const li = e.target.closest("li");
    if (!li || !li.dataset.peer) return;
    await startChatWith(li.dataset.peer);
  });
}

// Klick außerhalb schließt Dropdown
document.addEventListener("click", (e) => {
  if (!searchBox) return;
  if (!searchBox.contains(e.target)) {
    clearSearchResults();
  }
});

// Plus-Button: Suchfeld einblenden und fokussieren
if (newChatBtn && !newChatBtn._wired) {
  newChatBtn._wired = true;
  newChatBtn.addEventListener("click", () => {
    if (searchBox) {
      searchBox.classList.add("is-visible");
    }
    if (searchInput) {
      searchInput.focus();
    }
  });
}

/* ---------- Einstellungen & Theme ---------- */

const THEME_KEY = "chat-theme";

/**
 * Aktiviert das gewünschte Theme und aktualisiert Button-States.
 */
function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch (e) {
    console.warn("Theme konnte nicht gespeichert werden:", e);
  }

  if (themeOptions && themeOptions.forEach) {
    themeOptions.forEach((btn) => {
      const isActive = btn.dataset.theme === t;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
}

/**
 * Liest Theme aus localStorage oder nutzt Default (dark).
 */
function initThemeFromStorage() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch (e) {
    console.warn("Theme konnte nicht aus localStorage gelesen werden:", e);
  }

  const preferred = stored === "light" || stored === "dark" ? stored : "dark";
  document.documentElement.setAttribute("data-theme", preferred);

  if (themeOptions && themeOptions.forEach) {
    themeOptions.forEach((btn) => {
      const isActive = btn.dataset.theme === preferred;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
}

/**
 * Öffnen/Schließen des Einstellungs-Modals.
 */
function openSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.add("open");
  settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.remove("open");
  settingsModal.setAttribute("aria-hidden", "true");
}

/* Event-Listener für Einstellungen */

if (settingsBtn && !settingsBtn._wired) {
  settingsBtn._wired = true;
  settingsBtn.addEventListener("click", () => {
    openSettingsModal();
  });
}

if (settingsClose && !settingsClose._wired) {
  settingsClose._wired = true;
  settingsClose.addEventListener("click", () => {
    closeSettingsModal();
  });
}

// Klick auf Backdrop schließt das Modal
if (settingsModal && !settingsModal._backdropWired) {
  settingsModal._backdropWired = true;
  settingsModal.addEventListener("click", (e) => {
    if (e.target.classList.contains("chat-modal-backdrop")) {
      closeSettingsModal();
    }
  });
}

// ESC-Taste schließt das Modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSettingsModal();
  }
});

// Klick auf Theme-Buttons
if (themeOptions && themeOptions.forEach) {
  themeOptions.forEach((btn) => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener("click", () => {
      const t = btn.dataset.theme;
      applyTheme(t);
    });
  });
}

// Initial Theme setzen
initThemeFromStorage();


/* ---------- Senden ---------- */

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activePeerId) return alert("Bitte zuerst einen Kontakt auswählen.");
  const text = input.value.trim();
  if (!text) return;

  // Optional: Schreibrecht absichern (nur accepted Kontakte)
  const { data: related, error: relErr } = await sb
    .from("contacts")
    .select("id")
    .or(`and(requester_id.eq.${me},addressee_id.eq.${activePeerId}),and(requester_id.eq.${activePeerId},addressee_id.eq.${me})`)
    .eq("status", "accepted")
    .limit(1);

  if (relErr) return alert("Fehler: " + relErr.message);
  if (!related || !related.length) return alert("Ihr seid (noch) keine bestätigten Kontakte.");

const { data, error } = await sb
  .from("messages")
  .insert({ sender_id: me, receiver_id: activePeerId, text })
  .select("*")
  .single();

if (error) return alert("Senden fehlgeschlagen: " + error.message);

// Falls PostgREST kein Row-Data zurückgibt, trotzdem sofort anzeigen (optimistisches Echo)
const msg = data ?? {
  sender_id: me,
  receiver_id: activePeerId,
  text,
  created_at: new Date().toISOString(),
};
renderMessage(msg);

input.value = "";

});

/* ---------- Rendering ---------- */

function renderMessage(msg) {
  const key = makeKey(msg);
  if (renderedKeys.has(key)) return;
  renderedKeys.add(key);

  const li = document.createElement("li");
  li.className = "msg " + (msg.sender_id === me ? "me" : "them");

  if (msg.id) li.dataset.msgId = msg.id;
  if (msg.read_at) li.dataset.read = "true";

  li.innerHTML = `
    <div class="msg-bubble">
      <div class="msg-text">${escapeHTML(msg.text)}</div>
    </div>
    <div class="meta"></div>
  `;

  messageList.appendChild(li);
  messageList.scrollTop = messageList.scrollHeight;
  updateReadIndicators();
}


// zeigt "Gelesen" nur, wenn die letzte Nachricht von mir ist UND gelesen wurde
function updateReadIndicators() {
  if (!messageList) return;

  // alle "Gelesen"-Texte bei eigenen Nachrichten leeren
  messageList.querySelectorAll(".msg.me .meta").forEach((el) => {
    el.textContent = "";
  });

  const allMessages = [...messageList.querySelectorAll(".msg")];
  if (!allMessages.length) return;

  const lastMsg = allMessages[allMessages.length - 1];

  // Nur anzeigen, wenn die letzte Nachricht von mir ist und als gelesen markiert wurde
  if (!lastMsg.classList.contains("me")) return;
  if (lastMsg.dataset.read !== "true") return;

  const meta = lastMsg.querySelector(".meta");
  if (meta) {
    meta.textContent = "Gelesen";
  }
}


// wird bei UPDATE-Events aus Supabase genutzt (read_at ändert sich)
function applyMessageUpdate(msg) {
  if (!msg || !msg.id) return;

  const li = messageList.querySelector(`.msg[data-msg-id="${msg.id}"]`);
  if (!li) return;

  if (msg.read_at) {
    li.dataset.read = "true";
  } else {
    delete li.dataset.read;
  }
  updateReadIndicators();
}

// Wenn der Chat mit dem Absender gerade offen ist und ich Empfänger bin,
// Nachricht sofort als gelesen markieren
async function markAsReadIfVisible(msg) {
  if (!msg || !msg.id) return;

  // Ich bin Empfänger?
  if (msg.receiver_id !== me) return;

  // Aktiver Chat genau mit diesem Absender?
  if (msg.sender_id !== activePeerId) return;

  // Schon gelesen?
  if (msg.read_at) return;

  const { error } = await sb
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", msg.id)
    .is("read_at", null);

  if (error) {
    console.warn("Konnte Nachricht nicht als gelesen markieren:", error);
  }
}


function escapeHTML(s){
  return s.replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

/* ---------- Initial laden ---------- */
await loadContacts();
await preloadContactDirectory();


// Globale Press-Pop-Animation für Elemente mit .pressable
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".pressable");
  if (!btn) return;
  btn.classList.remove("pop");
  requestAnimationFrame(() => {
    btn.classList.add("pop");
    btn.addEventListener("animationend", () => btn.classList.remove("pop"), {
      once: true,
    });
  });
});

