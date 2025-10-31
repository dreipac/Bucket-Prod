// ===== Supabase Init =====
const { url: SB_URL, anonKey: SB_ANON } = window.__SUPABASE || {};
const supabase = window.supabase?.createClient(SB_URL, SB_ANON);

// Elemente
const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const msg = document.getElementById("msg");
const magicBtn = document.getElementById("magicLinkBtn");

function showMsg(text, color = "#22b0ff") {
  msg.style.color = color;
  msg.textContent = text;
}

// Prüfen ob bereits eingeloggt → weiterleiten
(async () => {
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    window.location.href = "index.html";
  }
})();

// Login per Passwort
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mail = email.value.trim();
  const pw = password.value.trim();

  if (!mail) return showMsg("Bitte E-Mail eingeben", "#ef4444");

  try {
    let error;
    if (pw) {
      ({ error } = await supabase.auth.signInWithPassword({ email: mail, password: pw }));
    } else {
      ({ error } = await supabase.auth.signInWithOtp({
        email: mail,
        options: { emailRedirectTo: window.location.origin + "/index.html" },
      }));
    }

    if (error) throw error;
    if (pw) {
      showMsg("Erfolgreich angemeldet! Weiterleitung …");
      setTimeout(() => (window.location.href = "index.html"), 1000);
    } else {
      showMsg("Magic Link gesendet! Prüfe dein Postfach.", "#22c55e");
    }
  } catch (err) {
    console.error(err);
    showMsg(err.message || "Fehler beim Anmelden", "#ef4444");
  }
});

// Magic-Link explizit
magicBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  const mail = email.value.trim();
  if (!mail) return showMsg("Bitte E-Mail eingeben", "#ef4444");

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: mail,
      options: { emailRedirectTo: window.location.origin + "/index.html" },
    });
    if (error) throw error;
    showMsg("Magic Link gesendet! Prüfe dein Postfach.", "#22c55e");
  } catch (err) {
    console.error(err);
    showMsg(err.message || "Fehler beim Senden des Links", "#ef4444");
  }
});
