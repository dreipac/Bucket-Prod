  import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

  // ⬇️ Deine Werte einsetzen
  const SUPABASE_URL = "https://fvkrzfihlaaiedmdofcg.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2a3J6ZmlobGFhaWVkbWRvZmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTEzOTEsImV4cCI6MjA3NzQ2NzM5MX0.e2JP_i-LE_G0DzBdULiKoTA64KEDuCzFVBTte-apER4";

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = sb;

  // Session einmalig holen und global setzen
  const { data: { session } } = await sb.auth.getSession();
  window.__SB_USER__ = session?.user || null;

  // Signal: Supabase ist bereit
  window.__SB_READY__ = true;
  window.dispatchEvent(new Event("sb-ready"));

  // Auf spätere Änderungen reagieren (Login/Logout/Token-Refresh)
  sb.auth.onAuthStateChange((event, session) => {
    window.__SB_USER__ = session?.user || null;

    if (event === "SIGNED_OUT" || !session?.user) {
      // Bei Logout immer zurück zur Login-Seite
      if (!/login\.html$/i.test(location.pathname)) {
        location.href = "login.html";
      }
    }
  });
