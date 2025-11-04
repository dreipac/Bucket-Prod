// login.js
import "./supabase.js"; // stellt window.sb bereit

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

// Bereits eingeloggt? -> weiterleiten
(async () => {
  const { data: { session } } = await window.sb.auth.getSession();
  if (session?.user) location.href = "index.html";
})();

// Wechsel Links
goSignup.addEventListener("click", (e)=>{ e.preventDefault(); show("signup"); });
goLogin?.addEventListener("click",  (e)=>{ e.preventDefault(); show("login"); });

// Login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  msg.textContent = "Anmeldung …";
  const { error } = await window.sb.auth.signInWithPassword({ email, password });
  if (error){ msg.textContent = error.message; return; }
  location.href = "index.html";
});

// Signup
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  msg.textContent = "Konto wird erstellt …";
  const { error } = await window.sb.auth.signUp({ email, password });
  if (error){ msg.textContent = error.message; return; }
  msg.textContent = "Konto erstellt. Bitte E-Mail bestätigen und dann anmelden.";
  show("login");
});

// Forgot Password (einfacher Flow per E-Mail)
forgot.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  if (!email){ msg.textContent = "Bitte zuerst deine E-Mail im Feld oben eingeben."; return; }
  msg.textContent = "Reset-E-Mail wird gesendet …";
  const { error } = await window.sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/reset.html`
  });
  msg.textContent = error ? error.message : "Falls die Adresse existiert, wurde eine E-Mail gesendet.";
});
