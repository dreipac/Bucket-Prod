// global/ui.js

// ===== Pressable: Pop-Animation =====
let pressablePopWired = false;

export function initPressablePop(root = document) {
  if (pressablePopWired) return;
  pressablePopWired = true;

  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".pressable");
    if (!btn) return;

    btn.classList.remove("pop");
    requestAnimationFrame(() => btn.classList.add("pop"));
    btn.addEventListener(
      "animationend",
      () => btn.classList.remove("pop"),
      { once: true }
    );
  });
}


// ===== Floating-Labels für Felder mit .ff-Wrapper =====

export function setupFloatingField(inputEl) {
  if (!inputEl) return;

  const wrap = inputEl.closest(".ff");
  if (!wrap) return;

  const sync = () => {
    const hasVal = !!inputEl.value?.trim?.();
    wrap.classList.toggle("has-value", hasVal);
  };

  // beim Tippen / Verlassen Wert prüfen
  inputEl.addEventListener("input", sync);
  inputEl.addEventListener("blur", sync);

  // Initialzustand
  sync();
}

/**
 * Initialisiert alle Floating-Fields innerhalb eines Containers.
 * Erwartet Struktur: <div class="ff"><input ...><label>...</label></div>
 */
export function initFloatingFields(root = document) {
  const inputs = root.querySelectorAll(
    ".ff > input, .ff > textarea, .ff > select"
  );
  inputs.forEach((el) => setupFloatingField(el));
}



// ===== Ripple-Effekt für Buttons / Segmented Controls =====
export function attachRipple(container, buttonSelector) {
  if (!container) return;

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(buttonSelector);
    if (!btn || !container.contains(btn)) return;

    // Position/Größe bestimmen
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x =
      (e.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
    const y =
      (e.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;

    // Element erzeugen
    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.setProperty("--rs", size + "px");
    dot.style.setProperty("--rx", x + "px");
    dot.style.setProperty("--ry", y + "px");
    btn.appendChild(dot);

    dot.addEventListener("animationend", () => dot.remove(), { once: true });

    // kurzer „Clicked“-State speziell für Theme-Swatches
    if (btn.classList.contains("theme-swatch")) {
      btn.classList.add("clicked");
      setTimeout(() => btn.classList.remove("clicked"), 220);
    }
  });
}


// ===== Range-Füllung für <input type="range"> =====

export function applyRangeFill(el) {
  if (!el) return;

  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const val = Number(el.value || 0);

  const pct = (max - min) === 0
    ? 0
    : ((val - min) / (max - min)) * 100;

  el.style.setProperty("--val", pct + "%");
}

export function wireRangeFill(el) {
  if (!el || el._rangeFillWired) return;
  el._rangeFillWired = true;

  const update = () => applyRangeFill(el);

  // Initial setzen
  update();

  // Live-Updaten beim Ziehen / nach Change
  el.addEventListener("input", update);
  el.addEventListener("change", update);
}




// ===== Modals: open / close (mit Animation) =====

export function openModal(m) {
  if (!m) return;
  // Sichtbar machen, bevor Klassen gesetzt werden
  m.style.display = "block";
  m.classList.remove("closing");
  m.classList.add("open");
  m.setAttribute("aria-hidden", "false");
}

export function closeModal(m) {
  if (!m || (!m.classList.contains("open") && !m.classList.contains("closing"))) {
    return;
  }

  // Sofort interaktionslos machen, um "Blockiert"-Effekt zu vermeiden
  m.setAttribute("aria-hidden", "true");
  m.classList.add("closing");
  m.classList.remove("open");

  const dlg = m.querySelector(".modal-dialog");
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    m.classList.remove("closing", "open");
    m.style.display = "none";
    dlg?.removeEventListener("animationend", cleanup);
    dlg?.removeEventListener("transitionend", cleanup);
  };

  // Sowohl Animations- als auch Transitions-Ende abfangen
  if (dlg) {
    dlg.addEventListener("animationend", cleanup, { once: true });
    dlg.addEventListener("transitionend", cleanup, { once: true });
    // Fallback, falls gar kein Event feuert
    setTimeout(cleanup, 360);
  } else {
    // Kein Dialog gefunden → sofort aufräumen
    cleanup();
  }
}

// ===== Globale Modal-Handler: Backdrop + ESC =====

let modalHandlersWired = false;

export function initModalBackdropAndEsc() {
  if (modalHandlersWired) return;
  modalHandlersWired = true;

  // Klick auf .modal-backdrop → zugehöriges Modal schließen
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("modal-backdrop")) {
      const m = target.parentElement;
      if (m && m.classList.contains("modal")) {
        closeModal(m);
      }
    }
  });

  // ESC → das „oberste“ offene .modal schließen
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const openModals = Array.from(
      document.querySelectorAll(".modal.open")
    );
    if (!openModals.length) return;

    const topMost = openModals[openModals.length - 1];
    closeModal(topMost);
  });
}


// ===== Theme-System (Dark/Light/Galaxy + Background) =====

const THEME_STORAGE_KEY = "straton-theme";
const BG_STORAGE_KEY    = "straton-bg";

/**
 * Setzt das globale App-Theme (dark/light/galaxy) auf <html data-theme="">
 * und speichert es in localStorage.
 */
export function applyTheme(theme) {
  const allowed = ["dark", "light", "galaxy"];
  const t = allowed.includes(theme) ? theme : "dark";

  document.documentElement.setAttribute("data-theme", t);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

/**
 * Liest das Theme aus localStorage (oder verwendet Fallback)
 * und wendet es an.
 */
export function initTheme(defaultTheme = "dark") {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    /* ignore */
  }

  const allowed = ["dark", "light", "galaxy"];
  const initial = allowed.includes(stored) ? stored : defaultTheme;

  applyTheme(initial);
  return initial;
}

/**
 * Verknüpft deinen "Darstellung"-Segment-Schalter (#modeSegment) mit applyTheme().
 * Erwartet Buttons mit data-mode="dark|light|galaxy".
 */
export function initThemeSegment(segmentEl) {
  if (!segmentEl) return;

  const buttons = [...segmentEl.querySelectorAll(".seg-btn")];
  if (!buttons.length) return;

  const current = document.documentElement.getAttribute("data-theme") || "dark";

  // aktuellen Status in UI spiegeln
  buttons.forEach((btn) => {
    const mode = btn.dataset.mode;
    const active = mode === current;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  segmentEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn || !segmentEl.contains(btn)) return;

    const mode = btn.dataset.mode;
    if (!mode) return;

    applyTheme(mode);

    buttons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  });
}

/**
 * Setzt den App-Hintergrund (Zürich, Genf, …) via CSS-Variable --bg-url
 * und speichert die Auswahl.
 */
export function applyBackground(bgKey) {
  // Mapping wie in deinem Select
  const map = {
    zurich:  'url("background/zurich.png")',
    geneva:  'url("background/geneva.png")',
    zug:     'url("background/zug.png")',
    prizren: 'url("background/prizren.png")',
    chur:    'url("background/chur.png")',
    luzern:  'url("background/luzern.png")',
    lugano:  'url("background/lugano.png")',
  };

  const fallbackKey = "zurich";
  const key = bgKey in map ? bgKey : fallbackKey;
  const url = map[key];

  document.documentElement.style.setProperty("--bg-url", url);

  try {
    localStorage.setItem(BG_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }

  return key;
}

/**
 * Initialisiert das Hintergrund-Select (#bgSelect) und setzt initialen Wert.
 */
export function initBackgroundSelector(selectEl) {
  if (!selectEl) return;

  let stored = null;
  try {
    stored = localStorage.getItem(BG_STORAGE_KEY);
  } catch {
    /* ignore */
  }

  const initialKey = applyBackground(stored || selectEl.value || "zurich");

  // UI-Sync
  if (selectEl.value !== initialKey) {
    selectEl.value = initialKey;
  }

  selectEl.addEventListener("change", () => {
    applyBackground(selectEl.value);
  });
}


// ===== Toast + Clipboard Helper =====

let _toastTimeoutId = null;

/**
 * Verkabelt einen "Kopieren"-Icon-Button mit:
 *  - Text aus einem Element lesen
 *  - in Zwischenablage kopieren
 *  - globalen Toast anzeigen
 *
 * @param {Object} opts
 * @param {string} opts.triggerSelector  z.B. "#copyAccountIdIcon"
 * @param {string} opts.textSelector     z.B. ".profile-id"
 * @param {string} [opts.toastSelector]  Standard "#copyToast"
 * @param {string} [opts.closeSelector]  Standard "#copyToastClose"
 */
export function initCopyToast(opts) {
  const {
    triggerSelector,
    textSelector,
    toastSelector = "#copyToast",
    closeSelector = "#copyToastClose",
  } = opts;

  const triggerEl = document.querySelector(triggerSelector);
  const textEl    = document.querySelector(textSelector);
  const toastEl   = document.querySelector(toastSelector);
  const closeEl   = document.querySelector(closeSelector);

  if (!triggerEl || !textEl || !toastEl) {
    // Silent fail – Seite kann auch ohne Toast leben
    return;
  }

  function hideToast() {
    toastEl.classList.remove("is-visible");
    toastEl.setAttribute("aria-hidden", "true");
  }

  function showToast() {
    // evtl. alten Timeout killen
    if (_toastTimeoutId) {
      clearTimeout(_toastTimeoutId);
      _toastTimeoutId = null;
    }

    // Animation reset
    toastEl.classList.remove("is-visible");
    void toastEl.offsetWidth; // Reflow
    toastEl.classList.add("is-visible");
    toastEl.setAttribute("aria-hidden", "false");

    _toastTimeoutId = setTimeout(() => {
      hideToast();
      _toastTimeoutId = null;
    }, 3000);
  }

  triggerEl.addEventListener("click", async () => {
    const text = textEl.textContent?.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);

      // kleines Feedback am Icon
      triggerEl.style.opacity = "0.5";
      setTimeout(() => (triggerEl.style.opacity = "1"), 250);

      showToast();
    } catch {
      alert("Konnte Text nicht kopieren");
    }
  });

  closeEl?.addEventListener("click", () => {
    if (_toastTimeoutId) {
      clearTimeout(_toastTimeoutId);
      _toastTimeoutId = null;
    }
    hideToast();
  });
}


export function showToastMessage(title, message = "", duration = 3000) {
  const toastEl = document.querySelector("#copyToast");
  const titleEl = toastEl.querySelector(".toast__title");
  const msgEl   = toastEl.querySelector(".toast__message");

  titleEl.textContent = title;
  msgEl.textContent   = message;

  // Animation reset
  toastEl.classList.remove("is-visible");
  void toastEl.offsetWidth;
  toastEl.classList.add("is-visible");

  toastEl.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    toastEl.classList.remove("is-visible");
    toastEl.setAttribute("aria-hidden", "true");
  }, duration);
}
