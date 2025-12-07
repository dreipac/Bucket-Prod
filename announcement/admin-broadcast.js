// announcement/admin-broadcast.js
// Admin-UI: Button "Meldungen" + Dialog zum Senden

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
    return !!data?.is_admin;
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

  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return;
  // Sidebar-Button holen
const trigger = document.getElementById("adminPanelBtn");
if (!trigger) return;

// Sidebar-Button anzeigen
trigger.hidden = false;


  // Admin-Modal
  const overlay = document.createElement("div");
  overlay.classList.add("ann-overlay", "ann-overlay--admin");

  const card = document.createElement("section");
  card.classList.add("ann-card", "ann-card--admin");

  const title = document.createElement("h2");
  title.classList.add("ann-card__title");
  title.textContent = "Broadcast senden";

  const form = document.createElement("div");
  form.classList.add("ann-form");

  const labelTitle = document.createElement("label");
  labelTitle.classList.add("ann-field");
  labelTitle.innerHTML = `
    <span class="ann-field__label">Titel</span>
    <input class="ann-input" type="text" placeholder="z.B. Wartung, Info, Update …">
  `;

  const labelBody = document.createElement("label");
  labelBody.classList.add("ann-field");
  labelBody.innerHTML = `
    <span class="ann-field__label">Nachricht</span>
    <textarea class="ann-textarea" rows="4" placeholder="Was sollen alle gerade eingeloggten Nutzer sehen?"></textarea>
  `;

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

  form.appendChild(labelTitle);
  form.appendChild(labelBody);
  card.appendChild(title);
  card.appendChild(form);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const inputTitle = labelTitle.querySelector("input");
  const textarea = labelBody.querySelector("textarea");

  function openModal() {
    overlay.classList.add("ann-overlay--open");
    inputTitle.focus();
  }

  function closeModal() {
    overlay.classList.remove("ann-overlay--open");
  }

  trigger.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && overlay.classList.contains("ann-overlay--open")) {
      closeModal();
    }
  });

  async function sendBroadcast() {
    const titleVal = inputTitle.value.trim();
    const bodyVal = textarea.value.trim();
    if (!titleVal || !bodyVal) {
      alert("Bitte Titel und Nachricht ausfüllen.");
      return;
    }

    pushBtn.disabled = true;
    pushBtn.textContent = "Senden…";

    try {
      const user = window.__SB_USER__;
      const { error } = await sb.from("announcements").insert({
        title: titleVal,
        body: bodyVal,
        created_by: user?.id ?? null,
      });

      if (error) {
        console.error("[Broadcast] Fehler beim Senden:", error);
        alert("Senden fehlgeschlagen. Siehe Konsole für Details.");
      } else {
        inputTitle.value = "";
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
