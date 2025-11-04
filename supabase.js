  // Diese Datei NICHT bundlen – sie wird direkt von index.html und login.html importiert.
  // Setze deine echten Keys hier ein oder ersetze unten via .env-injection beim Build.
  const SUPABASE_URL = window.SUPABASE_URL || "https://fvkrzfihlaaiedmdofcg.supabase.co";
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2a3J6ZmlobGFhaWVkbWRvZmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTEzOTEsImV4cCI6MjA3NzQ2NzM5MX0.e2JP_i-LE_G0DzBdULiKoTA64KEDuCzFVBTte-apER4";

  // Supabase v2 CDN laden (einmalig)
  if (!window.supabase) {
    const s = document.createElement('script');
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.defer = false;
    document.head.appendChild(s);
    await new Promise(r => s.onload = r);
  }

  // Client global bereitstellen
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);