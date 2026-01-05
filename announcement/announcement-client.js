// announcement/announcement-client.js
// Zeigt Broadcast-Meldungen bei ALLEN eingeloggten Usern an

import { sb } from "../shared/supabase.js";

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

async function markSeenDB(announcementId) {
  const user = window.__SB_USER__;
  if (!user?.id || !announcementId) return;

  try {
    await sb
      .from("announcement_seen")
      .upsert(
        {
          user_id: user.id,
          announcement_id: announcementId,
        },
        { onConflict: "user_id,announcement_id" }
      );
  } catch (err) {
    console.error("[Announcements] markSeenDB fehlgeschlagen:", err);
  }
}

async function fetchSeenSetForUser(announcementIds) {
  const user = window.__SB_USER__;
  if (!user?.id || !announcementIds?.length) return new Set();

  try {
    const { data, error } = await sb
      .from("announcement_seen")
      .select("announcement_id")
      .eq("user_id", user.id)
      .in("announcement_id", announcementIds);

    if (error) {
      console.error("[Announcements] fetchSeenSetForUser Fehler:", error);
      return new Set();
    }

    return new Set((data ?? []).map((row) => row.announcement_id));
  } catch (err) {
    console.error("[Announcements] fetchSeenSetForUser Ausnahme:", err);
    return new Set();
  }
}


let overlayEl = null;
let titleEl = null;
let bodyEl = null;
let currentAnnouncement = null;
let isOpen = false;

// NEU: Preview-Modus (soll kein "seen" in DB schreiben)
let skipMarkSeen = false;


function ensureUserModal() {
  if (overlayEl) return;

  overlayEl = document.createElement("div");
  overlayEl.classList.add("ann-overlay", "ann-overlay--user");

  const card = document.createElement("section");
  card.classList.add("ann-card", "ann-card--user");

  const title = document.createElement("h2");
  title.classList.add("ann-card__title");
  title.textContent = "Meldung";

  const body = document.createElement("p");
  body.classList.add("ann-card__body");

  const footer = document.createElement("div");
  footer.classList.add("ann-card__footer");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("ann-btn", "ann-btn--primary", "pressable");
  btn.textContent = "Verstanden";


  footer.appendChild(btn);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(footer);
  overlayEl.appendChild(card);
  document.body.appendChild(overlayEl);

  titleEl = title;
  bodyEl = body;

  function close() {
    if (!isOpen) return;
    overlayEl.classList.remove("ann-overlay--open");
    isOpen = false;

    const shouldMarkSeen = !skipMarkSeen;
    skipMarkSeen = false;

    if (shouldMarkSeen && currentAnnouncement?.id) {
      markSeenDB(currentAnnouncement.id);
    }
    currentAnnouncement = null;
  }


  btn.addEventListener("click", close);
  overlayEl.addEventListener("click", (ev) => {
    if (ev.target === overlayEl) close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && isOpen) {
      close();
    }
  });
}

function showAnnouncement(ann) {
  ensureUserModal();
  currentAnnouncement = ann || null;

  const title = (ann?.title || "").trim();
  const body = (ann?.body || "").trim();

  titleEl.textContent = title || "Meldung";
  bodyEl.textContent = body;

  overlayEl.classList.add("ann-overlay--open");
  isOpen = true;
}

async function loadInitialAnnouncements() {
const user = window.__SB_USER__;
const { data, error } = await sb
  .from("announcements")
  .select("id, title, body, created_at, target_user_id")
  // nur globale oder für diesen User:
  .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
  .order("created_at", { ascending: false })
  .limit(20);


  if (error) {
    console.error("[Announcements] Laden fehlgeschlagen:", error);
    return;
  }

  const anns = data ?? [];
  if (!anns.length) return;

  // IDs sammeln
  const ids = anns.map((a) => a.id).filter(Boolean);

  // Set mit bereits gesehenen Announcements für diesen User holen
  const seenSet = await fetchSeenSetForUser(ids);

  // Jüngste ungesehene anzeigen
  for (let i = 0; i < anns.length; i++) {
    const ann = anns[i];
    if (!ann?.id) continue;
    if (seenSet.has(ann.id)) continue; // schon gesehen -> skip
    showAnnouncement(ann);
    break;
  }
}


let channel = null;

function setupRealtime() {
  if (channel) return;

  channel = sb
    .channel("announcements-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        async (payload) => {
          const ann = payload.new;
          if (!ann?.id) return;

          // nur globale (null) oder an mich
          const me = window.__SB_USER__?.id;
          if (!me) return;
          if (ann.target_user_id && ann.target_user_id !== me) return;


          const seenSet = await fetchSeenSetForUser([ann.id]);
          if (seenSet.has(ann.id)) return;

          showAnnouncement(ann);
        }
      )

    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.info("[Announcements] Realtime aktiv");
      }
    });
}

export async function initAnnouncementListener() {
  await waitForSBReady();
  if (!window.__SB_USER__) return;

  ensureUserModal();
  await loadInitialAnnouncements();
  setupRealtime();
}

// NEU: Admin-Vorschau (zeigt Modal wie User, ohne DB "seen" zu markieren)
export function previewAnnouncement({ title, body }) {
  ensureUserModal();
  skipMarkSeen = true;
  showAnnouncement({
    id: null, // wichtig: null => nichts in "announcement_seen"
    title: title ?? "",
    body: body ?? ""
  });
}

