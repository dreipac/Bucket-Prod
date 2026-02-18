import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const SUPABASE_URL = "https://fvkrzfihlaaiedmdofcg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2a3J6ZmlobGFhaWVkbWRvZmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTEzOTEsImV4cCI6MjA3NzQ2NzM5MX0.e2JP_i-LE_G0DzBdULiKoTA64KEDuCzFVBTte-apER4";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sb = sb;

/* ---------- Helpers ---------- */

// Bin ich gerade auf der Login-Seite?
function onLoginPage() {
  return false;
}

// Projektbasis ermitteln (Ordner, in dem index.html liegt)
function projectBase() {
  // entfernt /Chat/... /Bucket/... /login/... oder den Dateinamen am Ende
  return location.pathname.replace(/\/(chat|bucket|login)\/.*|\/[^/]*$/i, "/");
}

// Login-URL absolut (bezogen auf Projektbasis) + next=...
function buildLoginHref() {
  const here = location.href;
  const url = new URL("https://dreipac.github.io/straton-login/");
  url.searchParams.set("next", here);
  return url.toString();
}



function resolvePostLoginTarget() {
  const url = new URL(location.href);
  const next = url.searchParams.get("next") || url.searchParams.get("returnTo");
  return next || projectBase() + "index.html";
}

/* ---------- Session initialisieren ---------- */

const { data: { session } } = await sb.auth.getSession();
window.__SB_USER__ = session?.user || null;

// Supabase ready
window.__SB_READY__ = true;
window.dispatchEvent(new Event("sb-ready"));

/* ---------- Auth-Events ---------- */

sb.auth.onAuthStateChange((event, session) => {
  window.__SB_USER__ = session?.user || null;

  if (event === "SIGNED_OUT" || !session?.user) {
    const href = buildLoginHref();
    if (href) location.href = href;
    return;
  }

  if (event === "SIGNED_IN" && onLoginPage()) {
    location.href = resolvePostLoginTarget();
  }
});

// Falls die Seite direkt mit bestehender Session auf login.html geladen wird → sofort weiter
if (session?.user && onLoginPage()) {
  location.href = resolvePostLoginTarget();
}






