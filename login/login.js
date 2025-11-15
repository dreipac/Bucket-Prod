// /app/login.js
import "../shared/supabase.js";

const loginForm  = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const goSignup   = document.getElementById("goSignup");
const goLogin    = document.getElementById("goLogin");
const forgot     = document.getElementById("forgot");
const msg        = document.getElementById("authMsg");

function show(form){
  loginForm.classList.toggle("hidden", form !== "login");
  signupForm.classList.toggle("hidden", form !== "signup");
  msg.textContent = "";
}

// ---- Helper: Initial-Profile nach dem ersten erfolgreichen Login setzen
async function ensureInitialProfile() {
  try {
    const { data: { session } } = await window.sb.auth.getSession();
    const user = session?.user;
    if (!user) return;

    // Namen aus preSignUp holen (lokal zwischengespeichert beim Registrieren)
    const raw = localStorage.getItem("preProfile");
    if (!raw) return;
    const pre = JSON.parse(raw || "{}");
    const first = (pre.first || "").trim();
    const last  = (pre.last  || "").trim();
    if (!first || !last) { localStorage.removeItem("preProfile"); return; }

    // Vorhandene prefs ziehen
    const { data, error } = await window.sb
      .from("bucket_data")
      .select("prefs")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") throw error; // 116 = no rows

    const prev = data?.prefs || {};
    const next = {
      ...prev,
      profile: {
        ...(prev.profile || {}),
        first, last,
        // org bewusst leer; avatar bleibt wie gehabt oder null
        org: "",
        avatar: prev.profile?.avatar || null
      }
    };

    // Upsert auf user_id
    const { error: upErr } = await window.sb
      .from("bucket_data")
      .upsert({ user_id: user.id, prefs: next }, { onConflict: "user_id" });

    if (!upErr) {
      localStorage.removeItem("preProfile");
    }
  } catch (e) {
    // nie hart failen – bei Problemen zeigt die App später einfach das Profil-Modal
    console.warn("ensureInitialProfile failed", e);
  }
}

// Bereits eingeloggt? → zur Zielseite
(async () => {
  const params = new URLSearchParams(location.search);
  const returnTo = params.get("returnTo") || params.get("next"); // beides unterstützen
  const { data: { session } } = await window.sb.auth.getSession();

  if (session?.user) {
    if (returnTo) location.replace(returnTo);
    else          location.replace("../index.html"); // eine Ebene hoch
  }
})();

// Wechsel-Links
goSignup.addEventListener("click", (e)=>{ e.preventDefault(); show("signup"); });
goLogin?.addEventListener("click",  (e)=>{ e.preventDefault(); show("login"); });

// Login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  msg.textContent = "Anmeldung …";

  const { error } = await window.sb.auth.signInWithPassword({ email, password });
  if (error) { msg.textContent = error.message; return; }

  await ensureInitialProfile();

  const params = new URLSearchParams(location.search);
  const returnTo = params.get("returnTo") || params.get("next");
  if (returnTo) location.replace(returnTo);
  else          location.replace("../index.html"); // eine Ebene hoch
});

// Signup – Vorname/Nachname zwischenspeichern
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const first = document.getElementById("signupFirst").value.trim();
  const last  = document.getElementById("signupLast").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;

  if (!first || !last) {
    msg.textContent = "Bitte Vor- und Nachname angeben.";
    return;
  }

  // temporär lokal merken – wird beim ersten Login in prefs geschrieben
  localStorage.setItem("preProfile", JSON.stringify({ first, last }));

  msg.textContent = "Konto wird erstellt …";
  const { error } = await window.sb.auth.signUp({ email, password });
  if (error) { msg.textContent = error.message; return; }

  msg.textContent = "Konto erstellt. Bitte E-Mail bestätigen und anschließend anmelden.";
  show("login");
});

// Passwort vergessen
forgot.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  if (!email){ msg.textContent = "Bitte zuerst deine E-Mail oben eingeben."; return; }
  msg.textContent = "Reset-E-Mail wird gesendet …";
  const { error } = await window.sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/reset.html`
  });
  msg.textContent = error ? error.message : "Falls die Adresse existiert, wurde eine E-Mail gesendet.";
});
