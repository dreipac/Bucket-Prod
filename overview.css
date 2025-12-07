// overview.js – Auth-Gate + Logout
import "./shared/supabase.js";
import { initAnnouncementListener } from "./announcement/announcement-client.js";
import { setupAdminAnnouncementUI } from "./announcement/admin-broadcast.js";
import { initCopyToast } from "./global/ui.js";

// Auf Supabase warten
const waitForSB = () =>
  new Promise((resolve) => {
    if (window.__SB_READY__) return resolve();
    window.addEventListener("sb-ready", resolve, { once: true });
  });

await waitForSB();

// Nicht eingeloggt? → zur Login-Seite
if (!window.__SB_USER__) {
  const returnTo = encodeURIComponent("/index.html");
  location.replace(`./login/login.html?returnTo=${returnTo}`);
  throw new Error("Kein User – Redirect zu Login");
}

// Broadcast-System initialisieren
initAnnouncementListener().catch(console.error);
setupAdminAnnouncementUI().catch(console.error);

// >>> ab hier bleibt dein bisheriger Overview-Code (Profil, Kontakte, ...) unverändert

// ---- Profilkarte in der Sidebar hydratisieren ----
const profileAvatarEl = document.querySelector(".profile-avatar");
const profileNameEl   = document.querySelector(".profile-name");
const profileIdEl     = document.querySelector(".profile-id");

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
  const prefs = await loadBucketPrefs();

  const first = (prefs?.profile?.first || "").trim();
  const last  = (prefs?.profile?.last  || "").trim();
  const name  = [first, last].filter(Boolean).join(" ");

  // Name setzen
  if (profileNameEl && name) {
    profileNameEl.textContent = name;
  }

  // Avatar setzen (Data-URL aus prefs.profile.avatar), fallback auf Icon
  if (profileAvatarEl) {
    if (prefs?.profile?.avatar) {
      profileAvatarEl.src = prefs.profile.avatar;
      profileAvatarEl.alt = name ? `Profilbild von ${name}` : "Profilbild";
    } else {
      profileAvatarEl.src = "./assets/icons/userAvatar.png"; // Fallback
      profileAvatarEl.alt = "Profilbild";
    }
  }

  // Konto-ID aus public.users holen
  if (profileIdEl) {
    const accountId = await loadAccountId();
    if (accountId) {
      profileIdEl.textContent = accountId;
    } else {
      // Optional: wenn nix da ist, leerlassen oder "ohne Konto-ID"
      // profileIdEl.textContent = "";
    }
  }
}

// nach dem Auth-Check starten
hydrateProfileCard().catch(console.error);


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

// NEU: Button im „Kontakte verwalten“-Modal
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

  rows.forEach((row) => {
    // „Gegenüber“ ermitteln – die andere Person in der Beziehung
    const otherId =
      row.requester_id === me ? row.addressee_id : row.requester_id;

    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <div><strong>Kontakt:</strong> ${otherId}</div>
        <div class="meta">${new Date(row.created_at).toLocaleString()}</div>
      </div>
      <span class="row-actions">
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


initCopyToast({
  triggerSelector: "#copyAccountIdIcon",
  textSelector: ".profile-id",
});

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
