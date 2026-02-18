import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const SUPABASE_URL = "https://fvkrzfihlaaiedmdofcg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2a3J6ZmlobGFhaWVkbWRvZmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTEzOTEsImV4cCI6MjA3NzQ2NzM5MX0.e2JP_i-LE_G0DzBdULiKoTA64KEDuCzFVBTte-apER4";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sb = sb;

/* ---------- Helpers ---------- */

// Login-URL absolut (bezogen auf Projektbasis) + next=...
function buildLoginHref() {
  if (onLoginPage()) return null; // ganz wichtig: kein Redirect von login.html

  const here = location.pathname + location.search + location.hash; // wohin es zurückgehen soll
  const absLoginPath = projectBase() + "login/login.html";
  const url = new URL(absLoginPath, location.origin);   // absolute URL
  url.searchParams.set("next", here);                   // nur einmal anhängen
  return url.toString();
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
    const href = buildLoginHref();   // gibt auf login.html -> null zurück
    if (href) location.href = href;  // nur redirecten, wenn wir *nicht* schon auf login.html sind
    return;
  }
}




