// overview.js – Auth-Gate + Logout
import "./supabase.js";

// Auf Supabase warten
const waitForSB = () =>
  new Promise((resolve) => {
    if (window.__SB_READY__) return resolve();
    window.addEventListener("sb-ready", resolve, { once: true });
  });

await waitForSB();

// Nicht eingeloggt? → zur Login-Seite mit Rücksprung zur Übersicht
if (!window.__SB_USER__) {
  const returnTo = encodeURIComponent("/index.html");
  location.replace(`./app/login.html?returnTo=${returnTo}`);
}

// Logout-Button
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn?.addEventListener("click", async () => {
  try {
    await window.sb.auth.signOut();
    // Nach Logout zurück auf Login mit Rücksprung zur Übersicht
    const returnTo = encodeURIComponent("/index.html");
    location.replace(`./app/login.html?returnTo=${returnTo}`);
  } catch (e) {
    // Optional: Fehlermeldung oder Toast
    alert("Abmelden nicht möglich. Bitte erneut versuchen.");
  }
});
