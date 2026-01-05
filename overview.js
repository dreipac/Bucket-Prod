// overview.js – Auth-Gate + Logout + Theme Toggle
import "./shared/supabase.js";
import { initAnnouncementListener } from "./announcement/announcement-client.js";
import { setupAdminAnnouncementUI } from "./announcement/admin-broadcast.js";
import { initCopyToast } from "./global/ui.js";

// ===== Theme Toggle Logik =====
function initTheme() {
  const savedTheme = localStorage.getItem("straton-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (prefersDark ? "dark" : "light");
  
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeIcons(theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("straton-theme", newTheme);
  updateThemeIcons(newTheme);
}

function updateThemeIcons(theme) {
  const sunIcon = document.querySelector(".theme-icon-sun");
  const moonIcon = document.querySelector(".theme-icon-moon");
  const themeLabel = document.querySelector(".theme-label");
  
  if (sunIcon && moonIcon) {
    if (theme === "dark") {
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    } else {
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    }
  }
  
  if (themeLabel) {
    themeLabel.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }
}

// Theme beim Laden initialisieren
initTheme();

// Theme Toggle Button Event
const themeToggleBtn = document.getElementById("themeToggle");
themeToggleBtn?.addEventListener("click", toggleTheme);

// Auf Supabase warten
const waitForSB = () =>
  new Promise((resolve) => {
    if (window.__SB_READY__) return resolve();
    window.addEventListener("sb-ready", resolve, { once: true });
  });

await waitForSB();

// ===== Presence (Online/Away/Offline) wie in chat.js =====
let presenceChannel = null;

async function initPresenceOverview() {
  const sb = window.sb;
  const me = window.__SB_USER__?.id;
  if (!sb || !me) return;

  presenceChannel = sb.channel("presence:global", {
    config: { presence: { key: me } }
  });

  presenceChannel.on("presence", { event: "sync" }, () => {
    // Overview muss nichts rendern – wichtig ist nur: "me" wird als online/away geführt.
    // Optional: console.log(presenceChannel.presenceState());
  });

  await presenceChannel.subscribe(async (status) => {
    if (status !== "SUBSCRIBED") return;

    const initial = document.hidden ? "away" : "online";
    try {
      await presenceChannel.track({ state: initial, ts: Date.now() });
    } catch {}
  });

  document.addEventListener("visibilitychange", async () => {
    if (!presenceChannel) return;
    const st = document.hidden ? "away" : "online";
    try {
      await presenceChannel.track({ state: st, ts: Date.now() });
    } catch {}
  });

  window.addEventListener("beforeunload", () => {
    try {
      if (presenceChannel) sb.removeChannel(presenceChannel);
    } catch {}
  });
}


// Nicht eingeloggt? → zur Login-Seite
if (!window.__SB_USER__) {
  const returnTo = encodeURIComponent("/index.html");
  location.replace(`./login/login.html?returnTo=${returnTo}`);
  throw new Error("Kein User – Redirect zu Login");
}
// ===== Toast UI (Overview) =====
function ensureToastHost() {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  return host;
}

function showToast({ title = "Neue Nachricht", text = "", onOpen = null } = {}) {
    if (isToastsDisabled()) return;
  const host = ensureToastHost();

  const el = document.createElement("div");
  el.className = "toast";

  el.innerHTML = `
    <div>
      <p class="toast-title"></p>
      <p class="toast-text"></p>
    </div>
    <div class="toast-actions">
      <button type="button" class="toast-btn">Schließen</button>
      <button type="button" class="toast-btn primary">Öffnen</button>
    </div>
    <div class="toast-progress" aria-hidden="true"></div>
  `;


  el.querySelector(".toast-title").textContent = title;
  el.querySelector(".toast-text").textContent = text;

  const [closeBtn, openBtn] = el.querySelectorAll("button");

  const remove = () => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => el.remove(), 140);
  };

  closeBtn.addEventListener("click", remove);

  openBtn.addEventListener("click", () => {
    if (typeof onOpen === "function") onOpen();
    remove();
  });

  host.appendChild(el);

  // Auto-close + Progress-Bar synchron
  const TOAST_MS = 4000;
  el.style.setProperty("--toast-life", `${TOAST_MS}ms`);
  setTimeout(remove, TOAST_MS);

}

// ===== Unread Badge + Realtime for incoming messages =====
const unreadIds = new Set();
const unreadBadgeEl = document.getElementById("chatUnreadBadge");

// ===== Sonstiges Settings (Toasts/Badge) =====
const SETTINGS_TOASTS_KEY = "straton-setting-disable-toasts"; // "1" => disabled
const SETTINGS_BADGE_KEY  = "straton-setting-disable-badge";  // "1" => disabled

function isToastsDisabled() {
  try { return localStorage.getItem(SETTINGS_TOASTS_KEY) === "1"; } catch { return false; }
}
function isBadgeDisabled() {
  try { return localStorage.getItem(SETTINGS_BADGE_KEY) === "1"; } catch { return false; }
}

function applyMiscSettingsToUI() {
  // Switches syncen (falls DOM existiert)
  const toastToggle = document.getElementById("settingDisableToasts");
  const badgeToggle = document.getElementById("settingDisableBadge");

  if (toastToggle) toastToggle.checked = isToastsDisabled();
  if (badgeToggle) badgeToggle.checked = isBadgeDisabled();

  // Badge sofort korrekt rendern
  updateUnreadBadge();
}

// Event wiring (einmalig)
function wireMiscSettingsToggles() {
  const toastToggle = document.getElementById("settingDisableToasts");
  const badgeToggle = document.getElementById("settingDisableBadge");

  if (toastToggle && !toastToggle._wired) {
    toastToggle._wired = true;
    toastToggle.addEventListener("change", () => {
      try { localStorage.setItem(SETTINGS_TOASTS_KEY, toastToggle.checked ? "1" : "0"); } catch {}
    });
  }

  if (badgeToggle && !badgeToggle._wired) {
    badgeToggle._wired = true;
    badgeToggle.addEventListener("change", () => {
      try { localStorage.setItem(SETTINGS_BADGE_KEY, badgeToggle.checked ? "1" : "0"); } catch {}
      updateUnreadBadge(); // sofort ausblenden/anzeigen
    });
  }
}


function updateUnreadBadge() {
  if (!unreadBadgeEl) return;

  // Wenn Badge deaktiviert ist: immer ausblenden
  if (isBadgeDisabled()) {
    unreadBadgeEl.hidden = true;
    unreadBadgeEl.textContent = "0";
    return;
  }

  const n = unreadIds.size;
  if (n <= 0) {
    unreadBadgeEl.hidden = true;
    unreadBadgeEl.textContent = "0";
    return;
  }
  unreadBadgeEl.hidden = false;
  unreadBadgeEl.textContent = String(n > 99 ? "99+" : n);
}


// initiale ungelesene Messages zählen (receiver_id = me, read_at is null)
async function loadInitialUnread() {
  const uid = window.__SB_USER__?.id;
  if (!uid) return;

  const { data, error } = await window.sb
    .from("messages")
    .select("id")
    .eq("receiver_id", uid)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(200); // reicht in der Regel; Badge ist "99+" sowieso

  if (error) {
    console.warn("loadInitialUnread failed", error);
    return;
  }

  (data || []).forEach((row) => unreadIds.add(row.id));
  updateUnreadBadge();
}

// optional: Sender-Name kurz holen (für Toast)
async function getSenderName(uid) {
  try {
    const { data, error } = await window.sb
      .from("users")
      .select("first_name,last_name")
      .eq("user_id", uid)
      .single();

    if (error) return "Jemand";
    const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
    return name || "Jemand";
  } catch {
    return "Jemand";
  }
}

let _incomingMsgChannel = null;

async function initIncomingMessageNotifications() {
  const sb = window.sb;
  const me = window.__SB_USER__?.id;
  if (!sb || !me) return;

  await loadInitialUnread();

  _incomingMsgChannel = sb
    .channel(`overview-incoming-msg-${me}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `receiver_id=eq.${me}`
    }, async (payload) => {
      const msg = payload.new;
      if (!msg?.id) return;

      // nur ungelesene zählen
      if (msg.read_at == null) {
        unreadIds.add(msg.id);
        updateUnreadBadge();

        // Toast anzeigen
        const senderName = await getSenderName(msg.sender_id);
        showToast({
          title: "Neue Nachricht",
          text: `Von ${senderName}`,
          onOpen: () => {
            location.href = "./Chat/chat.html";
          }
        });
      }
    })
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "messages",
      filter: `receiver_id=eq.${me}`
    }, (payload) => {
      const msg = payload.new;
      if (!msg?.id) return;

      // wenn irgendwo gelesen wurde -> aus unread entfernen
      if (msg.read_at != null && unreadIds.has(msg.id)) {
        unreadIds.delete(msg.id);
        updateUnreadBadge();
      }
    })
    .subscribe();

  window.addEventListener("beforeunload", () => {
    try {
      if (_incomingMsgChannel) sb.removeChannel(_incomingMsgChannel);
    } catch {}
  });
}


// Presence starten, damit du auch auf der Overview als Online/Away angezeigt wirst
await initPresenceOverview();
await initIncomingMessageNotifications();



// Broadcast-System initialisieren
initAnnouncementListener().catch(console.error);
setupAdminAnnouncementUI().catch(console.error);

// ==============================
// Overview Stats: Aufgaben / Erledigt (aus bucket_data.state)
// ==============================
const statOpenEl = document.getElementById("statOpenTasks");
const statDoneEl = document.getElementById("statDoneTasks");

function computeTaskCounts(stateRaw) {
  const state = (stateRaw && typeof stateRaw === "object") ? stateRaw : {};
  const lists = Array.isArray(state.lists) ? state.lists : [];

  let total = 0;
  let done = 0;

  for (const l of lists) {
    const items = Array.isArray(l.items) ? l.items : [];
    total += items.length;
    done += items.filter(it => !!it.done).length;
  }

  const open = Math.max(0, total - done);
  return { total, open, done };
}

async function loadBucketState() {
  const uid = window.__SB_USER__?.id;
  if (!uid) return null;

  const { data, error } = await window.sb
    .from("bucket_data")
    .select("state")
    .eq("user_id", uid)
    .single();

  // Falls noch keine Row existiert (oder anderer Fehler) -> null/0 anzeigen
  if (error) {
    console.warn("loadBucketState failed", error);
    return null;
  }
  return data?.state ?? null;
}

async function refreshOverviewTaskStats() {
  const raw = await loadBucketState();
  const { open, done } = computeTaskCounts(raw);

  if (statOpenEl) statOpenEl.textContent = String(open);
  if (statDoneEl) statDoneEl.textContent = String(done);
}

// ==============================
// Weekly % Change (vs. previous week) using public.task_weekly_stats
// ==============================
const openChangeEl = document.getElementById("statOpenChange");
const doneChangeEl = document.getElementById("statDoneChange");

function pctChange(curr, prev) {
  if (prev == null || prev === 0) return null; // nicht sinnvoll
  return ((curr - prev) / prev) * 100;
}

function setChangeBadge(el, pct, mode) {
  if (!el) return;

  const svgUp = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 17 9 11 13 15 21 7"></polyline>
      <polyline points="14 7 21 7 21 14"></polyline>
    </svg>`;
  const svgDown = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 7 9 13 13 9 21 17"></polyline>
      <polyline points="21 10 21 17 14 17"></polyline>
    </svg>`;
  const svgFlat = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 12h16"></path>
    </svg>`;

  el.classList.remove("positive", "negative", "neutral");

  // Kein Vergleich möglich
  if (pct == null || !isFinite(pct)) {
    el.classList.add("neutral");
    el.innerHTML = `${svgFlat}<span>–</span>`;
    return;
  }

  const v = Math.round(pct);         // mathematisch (+/-)
  const absV = Math.abs(v);

  // Bewertung (gut/schlecht) nach deinem Wunsch:
 let cls = "neutral";
  cls = (v > 0) ? "positive" : (v < 0) ? "negative" : "neutral";

  el.classList.add(cls);

  // Anzeige: Vorzeichen nach Bewertung (nicht nach Mathe)
  const sign = (cls === "positive") ? "+" : (cls === "negative") ? "−" : "";
  const text = (cls === "neutral") ? "0%" : `${sign}${absV}%`;

  // Icon: ebenfalls nach Bewertung
  const icon = (cls === "positive") ? svgUp : (cls === "negative") ? svgDown : svgFlat;

  el.innerHTML = `${icon}<span>${text}</span>`;
}

// ==============================
// Overview Stats: Kontakte & Nachrichten (dynamisch + weekly trend + realtime)
// ==============================

const statContactsEl = document.getElementById("statContacts");
const statContactsChangeEl = document.getElementById("statContactsChange");

const statMessagesEl = document.getElementById("statMessages");
const statMessagesChangeEl = document.getElementById("statMessagesChange");

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // JS: So=0 ... Sa=6 -> wir wollen Montag=0
  const mondayIndex = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayIndex);
  return x;
}

function iso(d) {
  return new Date(d).toISOString();
}

// Badge: "mehr ist besser" (grün wenn gestiegen, rot wenn gesunken)
function setChangeBadgeMoreIsBetter(el, pct) {
  if (!el) return;

  const svgUp = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 17 9 11 13 15 21 7"></polyline>
      <polyline points="14 7 21 7 21 14"></polyline>
    </svg>`;
  const svgDown = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 7 9 13 13 9 21 17"></polyline>
      <polyline points="21 10 21 17 14 17"></polyline>
    </svg>`;
  const svgFlat = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 12h16"></path>
    </svg>`;

  el.classList.remove("positive", "negative", "neutral");

  if (pct == null || !isFinite(pct)) {
    el.classList.add("neutral");
    el.innerHTML = `${svgFlat}<span>–</span>`;
    return;
  }

  const v = Math.round(pct);
  const absV = Math.abs(v);

  if (v > 0) {
    el.classList.add("positive");
    el.innerHTML = `${svgUp}<span>+${absV}%</span>`;
  } else if (v < 0) {
    el.classList.add("negative");
    el.innerHTML = `${svgDown}<span>−${absV}%</span>`;
  } else {
    el.classList.add("neutral");
    el.innerHTML = `${svgFlat}<span>0%</span>`;
  }
}

// --- Kontakte zählen (accepted, egal ob requester/addressee) ---
async function countAcceptedContacts({ beforeIso = null } = {}) {
  const uid = window.__SB_USER__?.id;
  if (!uid) return 0;

  // WICHTIG: OR-Filter wie im Chat-Code (beidseitige Beziehung)
  let q = window.sb
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("status", "accepted")
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);

  // Für "Stand vorige Woche": alles, was VOR Wochenstart existierte
  // -> benötigt contacts.created_at (Standard bei Supabase meist vorhanden)
  if (beforeIso) q = q.lt("created_at", beforeIso);

  const { count, error } = await q;
  if (error) {
    console.warn("countAcceptedContacts failed", error);
    return 0;
  }
  return count ?? 0;
}

// --- Nachrichten zählen: gesendete Nachrichten pro Zeitraum ---
async function countMessagesSent({ fromIso, toIso = null } = {}) {
  const uid = window.__SB_USER__?.id;
  if (!uid) return 0;

  let q = window.sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", uid)
    .gte("created_at", fromIso);

  if (toIso) q = q.lt("created_at", toIso);

  const { count, error } = await q;
  if (error) {
    console.warn("countMessagesSent failed", error);
    return 0;
  }
  return count ?? 0;
}

async function refreshContactsAndTrend() {
  const weekStart = startOfWeekMonday(new Date());
  const weekStartIso = iso(weekStart);

  const currTotal = await countAcceptedContacts();                 // Kontakte aktuell
  const prevTotal = await countAcceptedContacts({ beforeIso: weekStartIso }); // Stand vor dieser Woche

  if (statContactsEl) statContactsEl.textContent = String(currTotal);

  const pct = pctChange(currTotal, prevTotal);
  setChangeBadgeMoreIsBetter(statContactsChangeEl, pct);
}

async function refreshMessagesAndTrend() {
  const weekStart = startOfWeekMonday(new Date());
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const weekStartIso = iso(weekStart);
  const prevWeekStartIso = iso(prevWeekStart);

  const currWeek = await countMessagesSent({ fromIso: weekStartIso });                 // diese Woche
  const prevWeek = await countMessagesSent({ fromIso: prevWeekStartIso, toIso: weekStartIso }); // vorige Woche

  if (statMessagesEl) statMessagesEl.textContent = String(currWeek);

  const pct = pctChange(currWeek, prevWeek);
  setChangeBadgeMoreIsBetter(statMessagesChangeEl, pct);
}

// initial
refreshContactsAndTrend().catch(console.error);
refreshMessagesAndTrend().catch(console.error);

// realtime subscriptions (automatisch aktualisieren)
const uidStats = window.__SB_USER__?.id;
let _contactsCh1 = null;
let _contactsCh2 = null;
let _messagesCh  = null;

if (uidStats && window.sb?.channel) {
  // Kontakte: OR geht nicht als einzelner filter -> zwei Channels
  _contactsCh1 = window.sb
    .channel(`overview-contacts-req-${uidStats}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "contacts",
      filter: `requester_id=eq.${uidStats}`
    }, () => refreshContactsAndTrend().catch(console.error))
    .subscribe();

  _contactsCh2 = window.sb
    .channel(`overview-contacts-addr-${uidStats}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "contacts",
      filter: `addressee_id=eq.${uidStats}`
    }, () => refreshContactsAndTrend().catch(console.error))
    .subscribe();

  // Nachrichten: für "versendet" reicht sender_id
  _messagesCh = window.sb
    .channel(`overview-messages-sent-${uidStats}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages",
      filter: `sender_id=eq.${uidStats}`
    }, () => refreshMessagesAndTrend().catch(console.error))
    .subscribe();

  window.addEventListener("beforeunload", () => {
    try {
      if (_contactsCh1) window.sb.removeChannel(_contactsCh1);
      if (_contactsCh2) window.sb.removeChannel(_contactsCh2);
      if (_messagesCh)  window.sb.removeChannel(_messagesCh);
    } catch (_) {}
  });
}


async function loadWeeklyStatsLast2() {
  const uid = window.__SB_USER__?.id;
  if (!uid) return [];

  // Wir holen die letzten 2 Wochen, sortiert absteigend
  const { data, error } = await window.sb
    .from("task_weekly_stats")
    .select("week_start, open_count, done_count, total_count")
    .eq("user_id", uid)
    .order("week_start", { ascending: false })
    .limit(2);

  if (error) {
    console.warn("loadWeeklyStatsLast2 failed", error);
    return [];
  }
  return data || [];
}

async function refreshWeeklyChanges() {
  const rows = await loadWeeklyStatsLast2();
  const curr = rows[0] || null;
  const prev = rows[1] || null;

  const openPct = (curr && prev) ? pctChange(curr.open_count, prev.open_count) : null;
  const donePct = (curr && prev) ? pctChange(curr.done_count, prev.done_count) : null;

  setChangeBadge(openChangeEl, openPct, "open");
  setChangeBadge(doneChangeEl, donePct, "done");
}

// initial
refreshWeeklyChanges().catch(console.error);

// und: wenn tasks sich ändern (bucket_data realtime), refreshen wir auch weekly changes
// (weil die aktuelle Woche durch saveState() laufend upgedatet wird)


// Initial laden
refreshOverviewTaskStats().catch(console.error);

// Realtime: immer aktuell bleiben, wenn sich bucket_data ändert
const _uid = window.__SB_USER__?.id;
let _statsChannel = null;

if (_uid && window.sb?.channel) {
  _statsChannel = window.sb
    .channel(`overview-task-stats-${_uid}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bucket_data",
        filter: `user_id=eq.${_uid}`,
      },
      () => {
        refreshOverviewTaskStats().catch(console.error);
        refreshWeeklyChanges().catch(console.error);
      }
    )
    .subscribe();

  // Cleanup beim Verlassen der Seite
  window.addEventListener("beforeunload", () => {
    try {
      if (_statsChannel) window.sb.removeChannel(_statsChannel);
    } catch (_) {}
  });
}

// >>> ab hier bleibt dein bisheriger Overview-Code (Profil, Kontakte, ...) unverändert

// ---- Profilkarte in der Sidebar hydratisieren ----
const profileAvatarEl = document.querySelector(".profile-avatar");
const profileNameEl   = document.querySelector(".profile-name");
const profileIdEl     = document.querySelector(".profile-id");

async function loadUsersProfile() {
  const uid = window.__SB_USER__?.id;
  if (!uid) return null;

  const { data, error } = await window.sb
    .from("users")
    .select("first_name,last_name,avatar_url,account_id")
    .eq("user_id", uid)
    .single();

  if (error) {
    console.warn("loadUsersProfile failed", error);
    return null;
  }

  return data || null;
}

// bucket_data.prefs laden (wie in der Bucket-App)
async function loadBucketPrefs() {
  const uid = window.__SB_USER__?.id;
  if (!uid) return null;

  const { data, error } = await window.sb
    .from("bucket_data")
    .select("prefs")
    .eq("user_id", uid)
    .single();

  if (error) {
    console.warn("loadBucketPrefs failed", error);
    return null;
  }
  return data?.prefs || null;
}

// Konto-ID aus public.users besorgen (wie sbGetAccountId in app.js)
async function loadAccountId() {
  const uid = window.__SB_USER__?.id;
  if (!uid) return "";

  const { data, error } = await window.sb
    .from("users")
    .select("account_id")
    .eq("user_id", uid)
    .single();

  if (error) {
    console.warn("loadAccountId failed", error);
    return "";
  }
  return data?.account_id || "";
}

async function hydrateProfileCard() {
  const u = await loadUsersProfile();

  const first = (u?.first_name || "").trim();
  const last  = (u?.last_name  || "").trim();
  const name  = [first, last].filter(Boolean).join(" ");

  const avatarSrc = u?.avatar_url || "./assets/icons/userAvatar.png";

  // Sidebar – Name
  if (profileNameEl) {
    profileNameEl.textContent = name || "—";
  }

  // Sidebar – Avatar
  if (profileAvatarEl) {
    profileAvatarEl.src = avatarSrc;
    profileAvatarEl.alt = name ? `Profilbild von ${name}` : "Profilbild";
  }

  // Greeting Card – Avatar (WICHTIG)
  const greetingAvatarEl = document.getElementById("greetingAvatar");
  if (greetingAvatarEl) {
    greetingAvatarEl.src = avatarSrc;
    greetingAvatarEl.alt = name ? `Profilbild von ${name}` : "Profilbild";
  }

  // Konto-ID
  if (profileIdEl) {
    profileIdEl.textContent = u?.account_id || "";
  }
}


async function hydrateGreeting() {
  const el = document.getElementById("greetingName");
  if (!el) return;

  const u = await loadUsersProfile();
  const firstName = (u?.first_name || "").trim();

  el.textContent = firstName ? `${firstName}!` : "!";
}


// nach dem Auth-Check starten
hydrateProfileCard().catch(console.error);
hydrateGreeting().catch(console.error);



// Logout-Button
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn?.addEventListener("click", async () => {
  try {
    await window.sb.auth.signOut();
    const returnTo = encodeURIComponent("/index.html");
    location.replace(`./login/login.html?returnTo=${returnTo}`);
  } catch (e) {
    // Optional: Fehlermeldung oder Toast
    alert("Abmelden nicht möglich. Bitte erneut versuchen.");
  }
});

async function handleAddContactClick() {
  const inputId = prompt("Bitte gib die Konto-ID oder User-UUID ein:");
  if (!inputId) return;

  const me = window.__SB_USER__?.id;
  if (!me) return alert("Nicht eingeloggt.");

  const raw = inputId.trim();

  // UUID erkennen
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 1) Konto-ID -> user_id auflösen (oder direkte UUID übernehmen)
  let targetUserId = null;
  if (uuidRe.test(raw)) {
    targetUserId = raw;
  } else {
    const { data: resolved, error: rErr } = await window.sb
      .rpc("resolve_user_by_account_id", { account_id: raw });
    if (rErr) return alert("Konto-ID konnte nicht geprüft werden: " + rErr.message);
    if (!resolved) return alert("Konto-ID nicht gefunden.");
    targetUserId = resolved;
  }

  if (targetUserId === me) return alert("Du kannst dich nicht selbst hinzufügen.");

  // 2) Duplikate prüfen
  const { data: existing, error: exErr } = await window.sb
    .from("contacts")
    .select("id,status")
    .in("requester_id", [me, targetUserId])
    .in("addressee_id", [me, targetUserId])
    .limit(1);

  if (exErr) return alert("Fehler beim Prüfen: " + exErr.message);
  if (existing && existing.length) {
    const st = existing[0].status;
    return alert(st === "accepted"
      ? "Ihr seid bereits verbunden."
      : "Es existiert bereits eine Anfrage/Beziehung (" + st + ").");
  }

  // 3) Anfrage anlegen
  const { error } = await window.sb.from("contacts").insert({
    requester_id: me,
    addressee_id: targetUserId,
    status: "pending",
  });

  if (error) return alert("Anfrage konnte nicht gesendet werden: " + error.message);
  alert("Kontaktanfrage gesendet. Die andere Person muss zustimmen.");
}

// alte Sidebar-Action (falls Button vorhanden ist)
const addBtn = document.getElementById("addContactBtn");
addBtn?.addEventListener("click", handleAddContactClick);

// NEU: Button im „Kontakte verwalten"-Modal
const manageAddBtn = document.getElementById("manageAddContactBtn");
manageAddBtn?.addEventListener("click", handleAddContactClick);


/* ===== Kontaktanfragen Modal ===== */

// Elemente
const pendingBtn = document.getElementById("pendingBtn");
const pendingModal = document.getElementById("pendingModal");
const pendingClose = document.getElementById("pendingClose");
const pendingList = document.getElementById("pendingRequestsList");

// Helfer: Modal öffnen/schließen
function openPendingModal() {
  if (!pendingModal) return;
  pendingModal.classList.add("open");
  pendingModal.setAttribute("aria-hidden", "false");
  // Inhalt laden
  renderPendingRequests();
}

function closePendingModal() {
  if (!pendingModal) return;
  pendingModal.classList.remove("open");
  pendingModal.setAttribute("aria-hidden", "true");
}

// Daten laden
async function fetchPendingRequests() {
  const me = window.__SB_USER__?.id;
  if (!me) return [];

  const { data, error } = await window.sb
    .from("contacts")
    .select("id, requester_id, created_at")
    .eq("addressee_id", me)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

// Rendering
async function renderPendingRequests() {
  if (!pendingList) return;
  pendingList.innerHTML = "";

  const rows = await fetchPendingRequests();

  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Keine Kontaktanfragen.";
    pendingList.appendChild(li);
    return;
  }

  rows.forEach((row) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <div><strong>Anfrage von:</strong> ${row.requester_id}</div>
        <div class="meta">${new Date(row.created_at).toLocaleString()}</div>
      </div>
      <span class="row-actions">
        <button data-accept="${row.id}">Annehmen</button>
        <button data-decline="${row.id}">Ablehnen</button>
      </span>
    `;
    pendingList.appendChild(li);
  });
}

// Aktionen: Accept/Decline
pendingList?.addEventListener("click", async (e) => {
  const acceptId = e.target?.dataset?.accept;
  const declineId = e.target?.dataset?.decline;

  if (acceptId) {
    const { error } = await window.sb.from("contacts")
      .update({ status: "accepted" })
      .eq("id", acceptId);
    if (error) return alert("Fehler beim Annehmen: " + error.message);
    await renderPendingRequests();
  }

  if (declineId) {
    const { error } = await window.sb.from("contacts")
      .update({ status: "declined" })
      .eq("id", declineId);
    if (error) return alert("Fehler beim Ablehnen: " + error.message);
    await renderPendingRequests();
  }
});

// Öffnen/Schließen binden
pendingBtn?.addEventListener("click", openPendingModal);
pendingClose?.addEventListener("click", closePendingModal);

// Klick auf Backdrop oder Schließen-Buttons
pendingModal?.addEventListener("click", (e) => {
  if (e.target?.dataset?.close !== undefined) closePendingModal();
});

// ESC schließt Modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pendingModal?.classList.contains("open")) {
    closePendingModal();
  }
});

/* ===== Kontakte Verwalten Modal ===== */

// Elemente
const manageBtn   = document.getElementById("manageContactsBtn");
const manageModal = document.getElementById("manageContactsModal");
const manageClose = document.getElementById("manageClose");
const manageList  = document.getElementById("manageContactsList");

// Modal öffnen/schließen
function openManageModal() {
  if (!manageModal) return;
  manageModal.classList.add("open");
  manageModal.setAttribute("aria-hidden", "false");
  renderManagedContacts();
}

function closeManageModal() {
  if (!manageModal) return;
  manageModal.classList.remove("open");
  manageModal.setAttribute("aria-hidden", "true");
}

// Daten laden: Alle akzeptierten Kontakte, an denen ICH beteiligt bin
async function fetchManagedContacts() {
  const me = window.__SB_USER__?.id;
  if (!me) return [];

  const { data, error } = await window.sb
    .from("contacts")
    .select("id, requester_id, addressee_id, created_at")
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });


  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}


// Rendering
async function renderManagedContacts() {
  if (!manageList) return;
  manageList.innerHTML = "";

  const me   = window.__SB_USER__?.id;
  const rows = await fetchManagedContacts();

  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Du hast noch keine akzeptierten Kontakte hinzugefügt.";
    manageList.appendChild(li);
    return;
  }

  // 1) IDs der "anderen" Person sammeln
  const otherIds = [...new Set(rows.map((row) => (
    row.requester_id === me ? row.addressee_id : row.requester_id
  )))];

  // 2) Profile aus public.users holen
  const { data: users, error: uErr } = await window.sb
    .from("users")
    .select("user_id, account_id, first_name, last_name, avatar_url")
    .in("user_id", otherIds);

  if (uErr) {
    console.error("Users load failed:", uErr);
  }

  const userMap = new Map((users || []).map((u) => [u.user_id, u]));

  // 3) Rendern
  rows.forEach((row) => {
    const otherId = row.requester_id === me ? row.addressee_id : row.requester_id;
    const u = userMap.get(otherId);

    const name = u
      ? [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unbekannter Nutzer"
      : "Unbekannter Nutzer";

    const accountId = u?.account_id || "";
    const avatar = u?.avatar_url || "./assets/icons/userAvatar.png";

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="contact-row">
        <img class="contact-avatar" src="${avatar}" alt="${name}">
        <div class="contact-info">
          <div class="contact-name">${name}</div>
          <div class="contact-id">${accountId}</div>
        </div>
      </div>

      <span class="row-actions">
        <span class="contact-date">
          ${new Date(row.created_at).toLocaleString()}
        </span>
        <button data-remove="${row.id}">Entfernen</button>
      </span>
    `;
    manageList.appendChild(li);
  });
}



// Entfernen-Action (löscht den Kontakt-Datensatz)
manageList?.addEventListener("click", async (e) => {
  const removeId = e.target?.dataset?.remove;
  if (!removeId) return;

  if (!confirm("Diesen Kontakt wirklich entfernen?")) return;

  const me = window.__SB_USER__?.id;
  // Sicherheits-Delete: Nur löschen, wenn ich auch der requester bin
  const { error } = await window.sb
    .from("contacts")
    .delete()
    .eq("id", removeId);

  if (error) return alert("Entfernen fehlgeschlagen: " + error.message);
  await renderManagedContacts();
});

// Öffnen/Schließen binden
manageBtn?.addEventListener("click", openManageModal);
manageClose?.addEventListener("click", closeManageModal);

const openContactsModalBtn = document.getElementById("openContactsModal");

openContactsModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();       // verhindert Seiten-Sprung
  openManageModal();        // vorhandenes Modal öffnen
});

// Klick auf Backdrop / Close
manageModal?.addEventListener("click", (e) => {
  if (e.target?.dataset?.close !== undefined) closeManageModal();
});

// ESC schließt Modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && manageModal?.classList.contains("open")) {
    closeManageModal();
  }
});


// ===== Konto-ID kopieren + Icon Feedback (Haken) =====
const copyAccountIdIcon = document.getElementById("copyAccountIdIcon");

function setCopyIconState(state = "copy") {
  if (!copyAccountIdIcon) return;

  if (state === "check") {
    // Lucide Check
    copyAccountIdIcon.innerHTML = `
      <path d="M20 6 9 17l-5-5"></path>
    `;
  } else {
    // Lucide Copy (dein Original)
    copyAccountIdIcon.innerHTML = `
      <rect x="9" y="9" width="13" height="13" rx="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    `;
  }
}

async function copyAccountIdToClipboard() {
  const idEl = document.querySelector(".profile-id");
  const text = (idEl?.textContent || "").trim();
  if (!text) return;

  try {
    // Modern
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  // Visuelles Feedback: kurz Haken
  setCopyIconState("check");
  setTimeout(() => setCopyIconState("copy"), 900);
}

copyAccountIdIcon?.addEventListener("click", copyAccountIdToClipboard);


/* ===== Mobile Sidebar Toggle (Hamburger / X) ===== */

const mobileToggleBtn = document.querySelector(".mobile-nav-toggle");
const sidebarCloseBtn = document.querySelector(".sidebar-close");

// Sidebar öffnen
mobileToggleBtn?.addEventListener("click", () => {
  document.body.classList.add("sidebar-open");
});

// Sidebar schließen (X-Button)
sidebarCloseBtn?.addEventListener("click", () => {
  document.body.classList.remove("sidebar-open");
});

// Optional: ESC schließt die Sidebar auch
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("sidebar-open")) {
    document.body.classList.remove("sidebar-open");
  }
});

// Heutiges Datum einfügen
const todayDateEl = document.getElementById("todayDate");
if (todayDateEl) {
  const today = new Date();
  const options = { weekday: "long", day: "numeric", month: "long" };
  todayDateEl.textContent = today.toLocaleDateString("de-DE", options);
}

await hydrateProfileCard();
await hydrateGreeting();

/* ===== Einstellungen Modal ===== */

const settingsBtn   = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const settingsClose = document.getElementById("settingsClose");

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

settingsBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openSettingsModal();
});

settingsClose?.addEventListener("click", closeSettingsModal);

settingsModal?.addEventListener("click", (e) => {
  if (e.target?.dataset?.close !== undefined) closeSettingsModal();
  if (e.target === settingsModal) closeSettingsModal(); // Klick auf Backdrop
});

// ESC schließt auch Settings
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsModal?.classList.contains("open")) {
    closeSettingsModal();
  }
});

/* ===== Settings Tabs (Left Sidebar) ===== */
function initSettingsTabs() {
  const modal = document.getElementById("settingsModal");
  if (!modal) return;

  const tabs = [...modal.querySelectorAll(".settings-tab")];
  const panels = [...modal.querySelectorAll(".settings-panel")];

  function activate(key) {
    // Tabs
    tabs.forEach((t) => {
      const isActive = t.dataset.tab === key;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    // Panels
    panels.forEach((p) => {
      const isActive = p.dataset.panel === key;
      p.classList.toggle("active", isActive);
      p.hidden = !isActive;
    });
  }

  modal.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".settings-tab");
    if (!btn) return;
    activate(btn.dataset.tab);
  });

  // Default
  activate("design");
}

initSettingsTabs();
wireMiscSettingsToggles();
applyMiscSettingsToUI();
