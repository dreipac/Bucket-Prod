// chat.js
import "../shared/supabase.js";

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
}

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
  data.forEach(renderMessage);

// Realtime-Subscription: höre auf ALLE Inserts und filtere im Callback auf dieses 1:1
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
      if (isBetween) renderMessage(msg);
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
  li.innerHTML = `
    <div>${escapeHTML(msg.text)}</div>
    <div class="meta">${new Date(msg.created_at).toLocaleString()}</div>
  `;
  messageList.appendChild(li);
  messageList.scrollTop = messageList.scrollHeight;
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

