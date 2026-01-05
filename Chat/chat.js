// chat.js
import "../shared/supabase.js";
import { initAnnouncementListener } from "../announcement/announcement-client.js";

// Auf Supabase warten
const waitForSB = () =>
  new Promise((resolve) => {
    if (window.__SB_READY__) return resolve();
    window.addEventListener("sb-ready", resolve, { once: true });
  });

await waitForSB();

if (!window.__SB_USER__) {
  const returnTo = encodeURIComponent("/Chat/chat.html");
  location.replace(`../login/login.html?returnTo=${returnTo}`);
  throw new Error("Kein User – Redirect zu Login");
}

// Broadcast-Meldungen für Chat aktivieren
initAnnouncementListener().catch(console.error);

// >>> darunter bleibt dein bisheriger Chat-Code unverändert


const sb = window.sb;
const me = window.__SB_USER__.id;
const MEDIA_BUCKET = "chat-media";


// ---------- Ende-zu-Ende: ECDH + AES-GCM ----------

const KEYPAIR_STORAGE_KEY = "chat-ecdh-keypair-v1";
let myKeyPair = null; // { publicKey, privateKey, publicJwk }

const peerKeyCache = new Map(); // peerId -> CryptoKey (Public Key)

/**
 * Lädt ein vorhandenes ECDH-Schlüsselpaar aus localStorage
 * oder erzeugt ein neues und speichert es dort.
 */
async function loadOrCreateKeyPair() {
  const stored = localStorage.getItem(KEYPAIR_STORAGE_KEY);

  // 1) Versuch: lokales Schlüsselpaar aus localStorage laden
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        parsed.publicKey,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
      );
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        parsed.privateKey,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey", "deriveBits"]
      );
      return { publicKey, privateKey, publicJwk: parsed.publicKey, privateJwk: parsed.privateKey };
    } catch (e) {
      console.warn("Konnte gespeicherte Schlüssel nicht laden, versuche Backup oder erzeuge neu:", e);
    }
  }

  // 2) Kein lokaler Key -> versuchen, aus verschlüsseltem Backup zu restaurieren
  try {
    const row = await getUserKeyRow(); // kann null sein
    if (
      row &&
      row.has_recovery_backup &&
      row.encrypted_private_jwk &&
      row.backup_salt &&
      row.backup_iv &&
      row.backup_kdf_iterations &&
      row.public_key_jwk
    ) {
      const restored = await restoreKeyPairFromBackup(row);
      if (restored) {
        // Wiederhergestelltes Schlüsselpaar auch wieder in localStorage speichern
        const publicJwk = row.public_key_jwk;
        const privateJwk = await crypto.subtle.exportKey("jwk", restored.privateKey);

        localStorage.setItem(
          KEYPAIR_STORAGE_KEY,
          JSON.stringify({ publicKey: publicJwk, privateKey: privateJwk })
        );

        return { publicKey: restored.publicKey, privateKey: restored.privateKey, publicJwk: publicJwk };
      }
    }
  } catch (e) {
    console.warn("Konnte Backup nicht wiederherstellen, erzeuge neues Schlüsselpaar:", e);
  }

  // 3) Fallback: komplett neues Schlüsselpaar erzeugen
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );

  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  localStorage.setItem(
    KEYPAIR_STORAGE_KEY,
    JSON.stringify({ publicKey: publicJwk, privateKey: privateJwk })
  );

  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, publicJwk, privateJwk };

}


/**
 * Initialisiert die lokale Krypto-Identität und synced den Public Key zu Supabase.
 */
async function initCryptoIdentity() {
  myKeyPair = await loadOrCreateKeyPair();

  const { error } = await sb
    .from("user_keys")
    .upsert(
      {
        user_id: me,
        public_key_jwk: myKeyPair.publicJwk
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Konnte Public Key nicht in Supabase speichern:", error);
  }
}

/* ---------- Recovery-Backup / Wiederherstellung ---------- */

// einfache Base64-Helper für Uint8Array
function toBase64(u8) {
  return btoa(String.fromCharCode(...u8));
}
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function setUserBadge(userId, status) {
  const s = status === "online" ? "online" : status === "away" ? "away" : "offline";

  // Kontaktliste
  const li = contactList?.querySelector(`li[data-peer="${userId}"]`);
  if (li) {
    const dot = li.querySelector(".status-dot");
    if (dot) dot.dataset.status = s;
  }

  // Such-Dropdown (wenn offen)
  if (searchResults) {
    const rows = searchResults.querySelectorAll(`li[data-peer="${userId}"] .status-dot`);
    rows.forEach(dot => (dot.dataset.status = s));
  }

  // Header (nur wenn der User gerade geöffnet ist)
  if (activePeerId === userId && titleEl) {
    const dot = titleEl.querySelector(".status-dot");
    if (dot) dot.dataset.status = s;

    const statusEl = document.getElementById("activeChatStatus");
    if (statusEl) {
      statusEl.dataset.status = s;
      statusEl.textContent =
        s === "online" ? "Online" : s === "away" ? "Abwesend" : "Offline";
    }
  }
}

function refreshAllBadges() {
  // alle bekannten Kontakte auf offline setzen
  contactList?.querySelectorAll("li[data-peer]").forEach(li => {
    const peerId = li.dataset.peer;
    const dot = li.querySelector(".status-dot");
    const state = peerId && presenceStateByUser.get(peerId);
    if (dot) dot.dataset.status = state ?? "offline";
  });

  // Header mitziehen
  if (activePeerId) {
    const state = presenceStateByUser.get(activePeerId) ?? "offline";
    const dot = titleEl?.querySelector(".status-dot");
    if (dot) dot.dataset.status = state;
  }
}

async function initPresence() {
  presenceChannel = sb.channel("presence:global", {
    config: { presence: { key: me } }
  });

  presenceChannel.on("presence", { event: "sync" }, () => {
    const state = presenceChannel.presenceState();

    // state = { userId: [ { state: "online"/"away", ... } ], ... }
    presenceStateByUser.clear();

    Object.entries(state).forEach(([uid, metas]) => {
      // nimm den letzten Meta-Eintrag
      const last = Array.isArray(metas) ? metas[metas.length - 1] : null;
      const st = last?.state === "away" ? "away" : "online";
      presenceStateByUser.set(uid, st);
    });

    refreshAllBadges();
  });

  await presenceChannel.subscribe(async (status) => {
    if (status !== "SUBSCRIBED") return;

    // initialer Status abhängig von Tab Sichtbarkeit
    const initial = document.hidden ? "away" : "online";
    await presenceChannel.track({ state: initial, ts: Date.now() });
  });

  // Abwesend/Online umschalten je nach Tab
  document.addEventListener("visibilitychange", async () => {
    if (!presenceChannel) return;
    const st = document.hidden ? "away" : "online";
    try {
      await presenceChannel.track({ state: st, ts: Date.now() });
    } catch {}
  });
}



// user_keys-Zeile laden (inkl. Backup-Infos)
async function getUserKeyRow() {
  const { data, error } = await sb
    .from("user_keys")
    .select("public_key_jwk, encrypted_private_jwk, backup_salt, backup_iv, backup_kdf_iterations, has_recovery_backup")
    .eq("user_id", me)
    .single();

  if (error) {
    // Wenn es die Zeile noch nicht gibt, ist das für neue User normal
    console.warn("user_keys konnte nicht geladen werden (evtl. neu?):", error);
    return null;
  }
  return data ?? null;
}

/**
 * Wird nach initCryptoIdentity aufgerufen.
 * Wenn es noch kein Recovery-Backup gibt, wird ein Modal angezeigt
 * und ein Recovery-Key + verschlüsseltes Backup erstellt.
 */
async function ensureRecoveryBackup() {
  // Falls aus irgendeinem Grund noch kein Key da ist: abbrechen
  if (!myKeyPair || !myKeyPair.privateKey) return;

  const row = await getUserKeyRow();
  if (!row) return;

  if (row.has_recovery_backup && row.encrypted_private_jwk) {
    // schon erledigt
    return;
  }

  // Backup existiert noch nicht -> Setup-Modal anzeigen
  await openRecoverySetupModal(myKeyPair.privateJwk);
}

/**
 * Erzeugt einen zufälligen Recovery Key (als Hex-String).
 * Du kannst das später auf Wörter / Base32 etc. ändern.
 */
function generateRecoveryKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Leitet aus Recovery Key + Salt einen AES-Schlüssel (PBKDF2) ab.
 */
async function deriveBackupAesKey(recoveryKey, salt, iterations) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(recoveryKey),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return aesKey;
}

/**
 * Zeigt ein Modal mit dem neu erzeugten Recovery Key an,
 * verschlüsselt den Private Key damit und speichert das Backup in Supabase.
 */
async function openRecoverySetupModal(privateKey) {
  const copyBtn = document.getElementById("recoveryCopyBtn");
  const modal = document.getElementById("recoveryModal");
  const keyEl = document.getElementById("recoveryKeyDisplay");
  const cb = document.getElementById("recoveryConfirm");
  const doneBtn = document.getElementById("recoveryDoneBtn");

  if (!modal || !keyEl || !cb || !doneBtn) {
    console.warn("Recovery-Modal-Elemente nicht gefunden – überspringe Recovery-Setup.");
    return;
  }

  const recoveryKey = generateRecoveryKey();
  keyEl.textContent = recoveryKey;

  if (copyBtn && !copyBtn._wired) {
  copyBtn._wired = true;
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      copyBtn.textContent = "Kopiert ✓";
      setTimeout(() => {
        copyBtn.textContent = "Kopieren";
      }, 1600);
    } catch {
      alert("Kopieren nicht möglich – bitte manuell markieren.");
    }
  });
}


  // UI vorbereiten
  cb.checked = false;
  doneBtn.disabled = true;

  const onChange = () => {
    doneBtn.disabled = !cb.checked;
  };

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      cb.checked = true;
      doneBtn.disabled = false;
    });
  }

  cb.addEventListener("change", onChange);

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  // Warten, bis der User auf "Fertig" klickt
  await new Promise((resolve) => {
    doneBtn.addEventListener(
      "click",
      () => {
        if (!cb.checked) return;
        resolve();
      },
      { once: true }
    );
  });

  // Modal schließen
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  cb.removeEventListener("change", onChange);

  // Jetzt das eigentliche verschlüsselte Backup erzeugen und hochladen
  try {
    await createAndUploadBackup(privateKey, recoveryKey);
  } catch (e) {
    console.error("Backup konnte nicht erstellt werden:", e);
    alert("Backup des Sicherheitsschlüssels konnte nicht erstellt werden. Du kannst es später erneut versuchen.");
  }
}

/**
 * Nimmt den Private Key, verschlüsselt ihn mit Recovery Key und
 * speichert das Ergebnis in user_keys.
 */
async function createAndUploadBackup(privateJwk, recoveryKey) {
  const enc = new TextEncoder();

  // Private Key als JWK exportieren
  const privateJson = JSON.stringify(privateJwk);
  const plainBytes = enc.encode(privateJson);

  // KDF-Parameter
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 200000; // ggf. später anpassen

  const aesKey = await deriveBackupAesKey(recoveryKey, salt, iterations);

  // AES-GCM Verschlüsselung
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plainBytes
  );
  const cipherBytes = new Uint8Array(cipherBuffer);

  const encrypted_private_jwk = toBase64(cipherBytes);
  const backup_salt = toBase64(salt);
  const backup_iv = toBase64(iv);

  const { error } = await sb
    .from("user_keys")
    .update({
      encrypted_private_jwk,
      backup_salt,
      backup_iv,
      backup_kdf_iterations: iterations,
      has_recovery_backup: true
    })
    .eq("user_id", me);

  if (error) {
    throw error;
  }
}

/**
 * Öffnet das Eingabe-Modal für den Recovery Key und gibt den eingegebenen
 * Schlüssel (String) oder null (bei Abbruch) zurück.
 */
async function openRecoveryInputModal() {
  const modal = document.getElementById("recoveryInputModal");
  const input = document.getElementById("recoveryInputField");
  const errorEl = document.getElementById("recoveryInputError");
  const cancelBtn = document.getElementById("recoveryInputCancelBtn");
  const submitBtn = document.getElementById("recoveryInputSubmitBtn");

  if (!modal || !input || !cancelBtn || !submitBtn) {
    console.warn("Recovery-Input-Modal-Elemente nicht gefunden – überspringe Wiederherstellung.");
    return null;
  }

  // Reset Zustand
  input.value = "";
  if (errorEl) errorEl.hidden = true;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  input.focus();

  return await new Promise((resolve) => {
    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onSubmit = () => {
      const val = input.value.trim();
      if (!val) {
        if (errorEl) {
          errorEl.textContent = "Bitte gib einen Schlüssel ein oder brich ab.";
          errorEl.hidden = false;
        }
        return;
      }
      cleanup();
      resolve(val);
    };

    function cleanup() {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      cancelBtn.removeEventListener("click", onCancel);
      submitBtn.removeEventListener("click", onSubmit);
    }

    cancelBtn.addEventListener("click", onCancel, { once: true });
    submitBtn.addEventListener("click", onSubmit, { once: true });
  });
}

/**
 * Nutzt die Daten aus user_keys und fragt den User nach seinem Recovery Key,
 * um das Schlüsselpaar wiederherzustellen. Gibt { publicKey, privateKey } oder null zurück.
 */
async function restoreKeyPairFromBackup(row) {
  const recoveryKey = await openRecoveryInputModal();
  if (!recoveryKey) {
    // User hat abgebrochen -> ohne Wiederherstellung weitermachen
    return null;
  }

  const encBytes = fromBase64(row.encrypted_private_jwk);
  const salt = fromBase64(row.backup_salt);
  const iv = fromBase64(row.backup_iv);
  const iterations = row.backup_kdf_iterations || 200000;

  try {
    const aesKey = await deriveBackupAesKey(recoveryKey, salt, iterations);

    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      encBytes
    );

    const dec = new TextDecoder();
    const privateJson = dec.decode(plainBuffer);
    const privateJwk = JSON.parse(privateJson);

    const privateKey = await crypto.subtle.importKey(
      "jwk",
      privateJwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      row.public_key_jwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    );

    return { publicKey, privateKey };
  } catch (e) {
    console.warn("Wiederherstellung mit Recovery Key fehlgeschlagen:", e);
    alert("Der Wiederherstellungsschlüssel war ungültig oder passt nicht zu deinem Backup. Es wird ein neuer Schlüssel erzeugt. Alte Nachrichten bleiben verschlüsselt.");
    return null;
  }
}



/**
 * Holt den Public Key eines Gesprächspartners aus Supabase (oder aus Cache).
 */
async function getPeerPublicKey(peerId) {
  if (peerKeyCache.has(peerId)) {
    return peerKeyCache.get(peerId);
  }

  const { data, error } = await sb
    .from("user_keys")
    .select("public_key_jwk")
    .eq("user_id", peerId)
    .single();

  if (error || !data?.public_key_jwk) {
    console.warn("Kein Public Key für Peer gefunden:", peerId, error);
    throw new Error("Der Kontakt hat noch keinen Sicherheitsschlüssel hinterlegt (E2EE nicht initialisiert).");
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    data.public_key_jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

  peerKeyCache.set(peerId, publicKey);
  return publicKey;
}

/**
 * Erzeugt aus meinem Private Key + Peer Public Key einen gemeinsamen AES-Key.
 */
async function deriveSharedAesKey(peerId) {
  if (!myKeyPair) {
    throw new Error("Krypto-Identität noch nicht initialisiert.");
  }

  const peerPublicKey = await getPeerPublicKey(peerId);

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: peerPublicKey
    },
    myKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return aesKey;
}

/**
 * Verschlüsselt Klartext für einen bestimmten Chat-Partner.
 * Format: IV_BASE64:CT_BASE64
 */
async function encryptForPeer(plainText, peerId) {
  const key = await deriveSharedAesKey(peerId);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plainText)
  );

  const ivB64 = btoa(String.fromCharCode(...iv));
  const cipherBytes = new Uint8Array(cipherBuffer);
  const ctB64 = btoa(String.fromCharCode(...cipherBytes));

  return `${ivB64}:${ctB64}`;
}

/**
 * Entschlüsselt für einen bestimmten Chat-Partner.
 * Alte Klartext-Nachrichten (ohne ":") werden einfach durchgereicht.
 */
async function decryptForPeer(payload, peerId) {
  if (!payload) return null;

  // alte, unverschlüsselte Nachrichten normal anzeigen
  if (!payload.includes(":")) return payload;

  const [ivB64, ctB64] = payload.split(":");
  if (!ivB64 || !ctB64) return null;

  try {
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));

    const key = await deriveSharedAesKey(peerId);

    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherBytes
    );

    return new TextDecoder().decode(plainBuffer);
  } catch (err) {
    console.warn("Entschlüsselung fehlgeschlagen -> Nachricht ausblenden:", err);
    return null; // <- WICHTIG: nichts anzeigen
  }
}

// ---------- E2EE Media (Images) über Supabase Storage ----------
// Format im Klartext (nach Entschlüsselung):
// "__img__:<mime>:<storagePath>"

function u8ToB64(u8) {
  return btoa(String.fromCharCode(...u8));
}
function b64ToU8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptBytesForPeer(plainU8, peerId) {
  const key = await deriveSharedAesKey(peerId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainU8);
  const cipherU8 = new Uint8Array(cipherBuf);

  // Payload als Bytes: [12 bytes IV][cipher...]
  const out = new Uint8Array(iv.length + cipherU8.length);
  out.set(iv, 0);
  out.set(cipherU8, iv.length);
  return out;
}

async function decryptBytesForPeer(encU8, peerId) {
  const key = await deriveSharedAesKey(peerId);
  const iv = encU8.slice(0, 12);
  const ct = encU8.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(plainBuf);
}

function makeMediaPath(peerId, mime) {
  const ext = (mime && mime.includes("/")) ? mime.split("/")[1].replace("jpeg", "jpg") : "bin";
  const stamp = Date.now();
  const rand = Math.random().toString(16).slice(2);
  return `${me}/${peerId}/${stamp}-${rand}.${ext}.enc`;
}

async function uploadEncryptedImage(encU8, storagePath) {
  const { error } = await sb
    .storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, encU8, {
      contentType: "application/octet-stream",
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;
}

async function downloadEncryptedImage(storagePath) {
  const { data, error } = await sb
    .storage
    .from(MEDIA_BUCKET)
    .download(storagePath);

  if (error) throw error;
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

async function renderImageIntoMessage(li, peerId, mime, storagePath) {
  // Platzhalter
  const bubble = li.querySelector(".msg-bubble");
  if (!bubble) return;

  bubble.innerHTML = `<div class="msg-text">🖼️ Bild wird geladen…</div>`;

  try {
    const encU8 = await downloadEncryptedImage(storagePath);
    const plainU8 = await decryptBytesForPeer(encU8, peerId);

    const blob = new Blob([plainU8], { type: mime || "image/png" });
    const url = URL.createObjectURL(blob);

    bubble.innerHTML = `
      <img class="msg-image" src="${url}" alt="Screenshot">
    `;
  } catch (e) {
    console.warn("Bild konnte nicht geladen/entschlüsselt werden:", e);
    bubble.innerHTML = `<div class="msg-text">⚠️ Bild konnte nicht angezeigt werden.</div>`;
  }
}



// DOM
const contactList = document.getElementById("contactList");
const messageList = document.getElementById("messageList");
const composer = document.getElementById("composer");
const input = document.getElementById("messageInput");
const titleEl = document.getElementById("activeChatName");

// Screenshot per Copy/Paste senden
if (input && !input._pasteWired) {
  input._pasteWired = true;

  input.addEventListener("paste", async (e) => {
    if (!activePeerId) return; // erst Chat wählen

    const items = e.clipboardData?.items;
    if (!items || !items.length) return;

    // Bild im Clipboard suchen
    const imgItem = [...items].find((it) => it.type && it.type.startsWith("image/"));
    if (!imgItem) return;

    e.preventDefault();

    const file = imgItem.getAsFile();
    if (!file) return;

    // Optional: Größe begrenzen (z.B. 8MB)
    const MAX = 8 * 1024 * 1024;
    if (file.size > MAX) {
      alert("Bild ist zu groß (max. 8MB).");
      return;
    }

    try {
      // 1) Bild lesen -> Uint8
      const buf = await file.arrayBuffer();
      const plainU8 = new Uint8Array(buf);

      // 2) Verschlüsseln mit Peer-Key
      const encU8 = await encryptBytesForPeer(plainU8, activePeerId);

      // 3) Upload in Storage
      const mime = file.type || "image/png";
      const path = makeMediaPath(activePeerId, mime);
      await uploadEncryptedImage(encU8, path);

      // 4) Als verschlüsselte Text-Nachricht den Verweis senden
      const payloadPlain = `__img__:${mime}:${path}`;
      const encryptedText = await encryptForPeer(payloadPlain, activePeerId);

      const { data, error } = await sb
        .from("messages")
        .insert({
          sender_id: me,
          receiver_id: activePeerId,
          text: encryptedText
        })
        .select("*")
        .single();

      if (error) throw error;

      renderMessage(data);
    } catch (err) {
      console.error("Paste-Upload fehlgeschlagen:", err);
      alert("Screenshot konnte nicht gesendet werden.");
    }
  });
}


const newChatBtn   = document.getElementById("newChatBtn");
const newChatModal = document.getElementById("newChatModal");
const newChatList  = document.getElementById("newChatList");
const newChatClose = document.getElementById("newChatClose");
const newChatEmpty = document.getElementById("newChatEmpty");
// NEU: Einstellungen / Theme
const settingsBtn      = document.getElementById("settingsBtn");
const settingsModal    = document.getElementById("settingsModal");
const settingsClose    = document.getElementById("settingsClose");
const themeOptions     = document.querySelectorAll(".settings-theme-option");


const searchInput   = document.getElementById("chatRecipientInput");
const searchResults = document.getElementById("chatRecipientResults");
const searchBox     = document.querySelector(".chat-recipient");

let contactDirectory = [];  // { id, first_name, last_name, avatar_url }




let activePeerId = null;
let subscription = null;
let peersWithChats = new Set();
let suppressAutoScroll = false;
let presenceChannel = null;
const presenceStateByUser = new Map();

// Duplikate vermeiden (optimistisch + Realtime)
const renderedKeys = new Set();
function makeKey(msg) {
  // Bevorzugt echte DB-ID, sonst stabiler Fallback
  return msg.id ?? `${msg.sender_id}|${msg.receiver_id}|${msg.text}|${msg.created_at}`;
}


/* ---------- Kontakte / Chats ---------- */

async function getUserProfile(uid) {
  const { data, error } = await sb
    .from("users")
    .select("first_name, last_name, avatar_url")
    .eq("user_id", uid)
    .single();

  if (error) {
    console.warn("Profil konnte nicht geladen werden:", error);
    return { first_name: "Unbekannter", last_name: "Kontakt", avatar_url: null };
  }
  return data;
}

// sorgt dafür, dass ein Eintrag in der Chat-Liste existiert
async function ensureChatEntry(peerId) {
  if (!peerId) return;

  // existiert schon?
  const existing = contactList.querySelector(`li[data-peer="${peerId}"]`);
  if (existing) return;

  const profile = await getUserProfile(peerId);

  const li = document.createElement("li");
  li.dataset.peer = peerId;
  li.classList.add("pressable");

  li.innerHTML = `
    <div class="chat-contact">
      <div class="avatar-wrap">
        <img class="chat-contact-avatar" src="${profile.avatar_url ?? '../assets/icons/default-avatar.png'}" alt="">
        <span class="status-dot" data-status="offline"></span>
      </div>

      <span class="chat-contact-name">
        ${profile.first_name ?? ''} ${profile.last_name ?? ''}
      </span>
    </div>
  `;

  contactList.appendChild(li);
  const st = presenceStateByUser.get(peerId) ?? "offline";
  setUserBadge(peerId, st);
}

// lädt NUR Personen, mit denen es schon Nachrichten gibt
async function loadContacts() {
  peersWithChats = new Set();
  contactList.innerHTML = "";

  const { data: msgs, error } = await sb
    .from("messages")
    .select("sender_id, receiver_id, created_at")
    .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Chats konnten nicht geladen werden:", error);
    return;
  }

  for (const row of (msgs ?? [])) {
    const peerId = row.sender_id === me ? row.receiver_id : row.sender_id;
    if (!peerId || peersWithChats.has(peerId)) continue;

    peersWithChats.add(peerId);
    await ensureChatEntry(peerId);
  }
}


/* ---------- Chat Auswahl ---------- */

contactList.addEventListener("click", async (e) => {
  const li = e.target.closest("li");
  if (!li) return;

  const peerId = li.dataset.peer;
  if (!peerId) return;

  await openChat(peerId);
});

async function openChat(peerId) {
  activePeerId = peerId;
  // Aktiven Chat in der Liste markieren
  [...contactList.querySelectorAll("li")].forEach(li => {
    li.classList.toggle("active", li.dataset.peer === peerId);
  });
  const profile = await getUserProfile(peerId);
  titleEl.innerHTML = `
    <div class="avatar-wrap">
      <img src="${profile.avatar_url ?? '../assets/icons/default-avatar.png'}" class="chat-title-avatar" alt="">
      <span class="status-dot" data-status="offline"></span>
    </div>

    <div class="chat-title-text">
      <div class="chat-title-name">${profile.first_name} ${profile.last_name}</div>
      <div class="chat-title-status" id="activeChatStatus" data-status="offline">Offline</div>
    </div>
  `;
const st = presenceStateByUser.get(peerId) ?? "offline";
setUserBadge(peerId, st);





  messageList.innerHTML = "";
  renderedKeys.clear(); // <- NEU: Duplikat-Set pro Chat zurücksetzen


  // Alte Realtime unsub
  if (subscription) {
    sb.removeChannel(subscription);
    subscription = null;
  }

  // Historie laden
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${me},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${me})`)
    .order("created_at", { ascending: true });

  if (error) return alert("Fehler beim Laden der Nachrichten: " + error.message);
  suppressAutoScroll = true;
  (data ?? []).forEach(renderMessage);
  suppressAutoScroll = false;

  // einmal hart ans Ende springen (ohne Animation)
  messageList.scrollTop = messageList.scrollHeight;

  updateReadIndicators();


  // alle eingehenden Nachrichten dieses Kontakts als gelesen markieren
  const now = new Date().toISOString();
  const { error: readErr } = await sb
    .from("messages")
    .update({ read_at: now })
    .eq("receiver_id", me)
    .eq("sender_id", peerId)
    .is("read_at", null);  // nur ungelesene

  if (readErr) {
    console.warn("Lesebestätigungen konnten nicht aktualisiert werden:", readErr);
  }

  // Realtime-Subscription: Inserts + Updates
  subscription = sb
    .channel("room:" + [me, peerId].sort().join("-"))
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload.new;
        const isBetween =
          (msg.sender_id === me && msg.receiver_id === peerId) ||
          (msg.sender_id === peerId && msg.receiver_id === me);

        if (!isBetween) return;

        // Nachricht im UI anzeigen
        renderMessage(msg);

        // Wenn ICH der Empfänger bin und der Chat offen ist:
        // sofort als gelesen markieren -> triggert UPDATE beim Sender
        markAsReadIfVisible(msg);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload.new;
        const isBetween =
          (msg.sender_id === me && msg.receiver_id === peerId) ||
          (msg.sender_id === peerId && msg.receiver_id === me);
        if (isBetween) applyMessageUpdate(msg);
      }
    )
    .subscribe();


  if (input) input.focus();
}

/* ---------- Neuer Chat über Suchfeld im Header ---------- */

// Alle bestätigten Kontakte einmal vorladen
async function preloadContactDirectory() {
  if (contactDirectory.length) return;

  const { data, error } = await sb.rpc("get_contacts_for_user", { uid: me });
  if (error) {
    console.error("Kontakte für Suche konnten nicht geladen werden:", error);
    return;
  }

  const ids = data ?? [];
  // Profile parallel laden
  const profiles = await Promise.all(ids.map((uid) => getUserProfile(uid)));

  contactDirectory = ids.map((id, idx) => ({
    id,
    ...profiles[idx],
  }));
}

// Hilfsfunktion: Vorschläge rendern
function renderSearchResults(matches) {
  if (!searchResults) return;

  searchResults.innerHTML = "";

  if (!matches.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Kein Kontakt gefunden.";
    searchResults.appendChild(li);
    searchResults.hidden = false;
    return;
  }

  for (const c of matches) {
    const li = document.createElement("li");
    li.dataset.peer = c.id;
    li.innerHTML = `
      <div class="avatar-wrap">
        <img src="${c.avatar_url ?? '../assets/icons/default-avatar.png'}" alt="">
        <span class="status-dot" data-status="offline"></span>
      </div>
      <span>${(c.first_name ?? '')} ${(c.last_name ?? '')}</span>
    `;
    searchResults.appendChild(li);
  }

  searchResults.hidden = false;
}

function clearSearchResults() {
  if (!searchResults) return;
  searchResults.hidden = true;
  searchResults.innerHTML = "";
}

// Chat mit ausgewähltem Kontakt starten
async function startChatWith(peerId) {
  if (!peerId) return;
  peersWithChats.add(peerId);
  await ensureChatEntry(peerId);
  await openChat(peerId);
  if (searchInput) searchInput.value = "";
  clearSearchResults();

  if (searchBox) {
    searchBox.classList.remove("is-visible");
  }

  // NEU: Cursor direkt ins Nachrichtenfeld unten
  if (input) input.focus();
}


// Eingabe im Suchfeld
if (searchInput && !searchInput._wired) {
  searchInput._wired = true;
  searchInput.addEventListener("input", async (e) => {
    const term = e.target.value.trim().toLowerCase();
    if (!term) {
      clearSearchResults();
      return;
    }

    await preloadContactDirectory();

    const matches = contactDirectory
      .filter((c) => {
        const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        return full.includes(term);
      })
      .slice(0, 8); // max. 8 Vorschläge

    renderSearchResults(matches);
  });
}

// Klick auf einen Vorschlag
if (searchResults && !searchResults._wired) {
  searchResults._wired = true;
  searchResults.addEventListener("click", async (e) => {
    const li = e.target.closest("li");
    if (!li || !li.dataset.peer) return;
    await startChatWith(li.dataset.peer);
  });
}

// Klick außerhalb schließt Dropdown
document.addEventListener("click", (e) => {
  if (!searchBox) return;
  if (!searchBox.contains(e.target)) {
    clearSearchResults();
  }
});

// Plus-Button: Suchfeld einblenden und fokussieren
if (newChatBtn && !newChatBtn._wired) {
  newChatBtn._wired = true;
  newChatBtn.addEventListener("click", () => {
    if (searchBox) {
      searchBox.classList.add("is-visible");
    }
    if (searchInput) {
      searchInput.focus();
    }
  });
}

function minuteKey(iso) {
  const d = new Date(iso);
  // Schlüssel pro Minute
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ` +
         `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

/**
 * Markiert nur die LETZTE Nachricht in einer zusammenhängenden Kette
 * (gleicher Sender + gleiche Minute) mit .show-meta
 */
function updateMinuteMetaGrouping() {
  const items = [...messageList.querySelectorAll(".msg")];
  if (!items.length) return;

  // reset
  items.forEach(li => li.classList.remove("show-meta"));

  let start = 0;

  for (let i = 1; i <= items.length; i++) {
    const prev = items[i - 1];

    // Block-Kriterium: gleicher Sender + gleiche Minute
    const prevSender = prev.classList.contains("me") ? "me" : "them";
    const prevMinute = prev.dataset.minute;

    const curr = items[i];
    const endBlock =
      (i === items.length) ||
      (() => {
        const currSender = curr.classList.contains("me") ? "me" : "them";
        const currMinute = curr.dataset.minute;
        return (currSender !== prevSender) || (currMinute !== prevMinute);
      })();

    if (endBlock) {
      // Letztes Element im Block bekommt Meta
      prev.classList.add("show-meta");
      start = i;
    }
  }
}

/* ---------- Einstellungen & Theme ---------- */

const THEME_KEY = "chat-theme";

/**
 * Aktiviert das gewünschte Theme und aktualisiert Button-States.
 */
function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch (e) {
    console.warn("Theme konnte nicht gespeichert werden:", e);
  }

  if (themeOptions && themeOptions.forEach) {
    themeOptions.forEach((btn) => {
      const isActive = btn.dataset.theme === t;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
}

/**
 * Liest Theme aus localStorage oder nutzt Default (dark).
 */
function initThemeFromStorage() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch (e) {
    console.warn("Theme konnte nicht aus localStorage gelesen werden:", e);
  }

  const preferred = stored === "light" || stored === "dark" ? stored : "dark";
  document.documentElement.setAttribute("data-theme", preferred);

  if (themeOptions && themeOptions.forEach) {
    themeOptions.forEach((btn) => {
      const isActive = btn.dataset.theme === preferred;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
}

/**
 * Öffnen/Schließen des Einstellungs-Modals.
 */
function openSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.add("open");
  settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.remove("open");
  settingsModal.setAttribute("aria-hidden", "true");
}

/* Event-Listener für Einstellungen */

if (settingsBtn && !settingsBtn._wired) {
  settingsBtn._wired = true;
  settingsBtn.addEventListener("click", () => {
    openSettingsModal();
  });
}

if (settingsClose && !settingsClose._wired) {
  settingsClose._wired = true;
  settingsClose.addEventListener("click", () => {
    closeSettingsModal();
  });
}

// Klick auf Backdrop schließt das Modal
if (settingsModal && !settingsModal._backdropWired) {
  settingsModal._backdropWired = true;
  settingsModal.addEventListener("click", (e) => {
    if (e.target.classList.contains("chat-modal-backdrop")) {
      closeSettingsModal();
    }
  });
}

// ESC-Taste schließt das Modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSettingsModal();
  }
});

// Klick auf Theme-Buttons
if (themeOptions && themeOptions.forEach) {
  themeOptions.forEach((btn) => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener("click", () => {
      const t = btn.dataset.theme;
      applyTheme(t);
    });
  });
}

// Initial Theme setzen
initThemeFromStorage();


/* ---------- Senden ---------- */

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activePeerId) return alert("Bitte zuerst einen Kontakt auswählen.");

  const plainText = input.value.trim();
  if (!plainText) return;

  // Optional: Schreibrecht absichern (nur accepted Kontakte)
  const { data: related, error: relErr } = await sb
    .from("contacts")
    .select("id")
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${activePeerId}),` +
      `and(requester_id.eq.${activePeerId},addressee_id.eq.${me})`
    )
    .eq("status", "accepted")
    .limit(1);

  if (relErr) return alert("Fehler: " + relErr.message);
  if (!related || !related.length) {
    return alert("Ihr seid (noch) keine bestätigten Kontakte.");
  }

  // 👉 NEU: Klartext verschlüsseln
  let encryptedText;
  try {
    encryptedText = await encryptForPeer(plainText, activePeerId);
  } catch (err) {
    console.error("Verschlüsselung fehlgeschlagen:", err);
    return alert("Verschlüsselung fehlgeschlagen – Nachricht wurde nicht gesendet.");
  }

  const { data, error } = await sb
    .from("messages")
    .insert({
      sender_id: me,
      receiver_id: activePeerId,
      text: encryptedText
    })
    .select("*")
    .single();

  if (error) return alert("Senden fehlgeschlagen: " + error.message);

  const msg = data ?? {
    sender_id: me,
    receiver_id: activePeerId,
    text: encryptedText,
    created_at: new Date().toISOString(),
  };
  renderMessage(msg);

  input.value = "";
});


/* ---------- Rendering ---------- */

function renderMessage(msg) {
  const key = makeKey(msg);
  if (renderedKeys.has(key)) return;
  renderedKeys.add(key);

  const li = document.createElement("li");
  li.className = "msg " + (msg.sender_id === me ? "me" : "them");
  li.dataset.minute = minuteKey(msg.created_at);

  if (msg.id) li.dataset.msgId = msg.id;
  if (msg.read_at) li.dataset.read = "true";

  // Platzhalter während der Entschlüsselung
li.innerHTML = `
  <div class="msg-bubble">
    <div class="msg-text">🔒 Nachricht wird entschlüsselt…</div>
  </div>
  <div class="meta"></div>
`;

const metaEl = li.querySelector(".meta");
if (metaEl) {
  const t = formatTime(msg.created_at);
  metaEl.dataset.sentTime = t;
  metaEl.textContent = t;
}

  messageList.appendChild(li);
  updateMinuteMetaGrouping(); 
  if (!suppressAutoScroll) {
    messageList.scrollTop = messageList.scrollHeight;
  }
  updateReadIndicators();

  // 👉 asynchron entschlüsseln, ohne den Rest zu blockieren
(async () => {
  const peerId =
    msg.sender_id === me ? msg.receiver_id : msg.sender_id;

  const plain = await decryptForPeer(msg.text, peerId);

  // wenn nicht entschlüsselbar, ausblenden/entfernen
  if (plain === null) {
    renderedKeys.delete(makeKey(msg));
    li.remove();
    updateMinuteMetaGrouping();
    updateReadIndicators();
    return;
  }

  // Bild-Nachricht?
  if (typeof plain === "string" && plain.startsWith("__img__:")) {
    const parts = plain.split(":"); // ["__img__", "<mime>", "<path>"]
    const mime = parts[1] || "image/png";
    const storagePath = parts.slice(2).join(":"); // falls ":" im path (selten)
    await renderImageIntoMessage(li, peerId, mime, storagePath);
    return;
  }

  // normale Text-Nachricht
  const textEl = li.querySelector(".msg-text");
  if (textEl) {
    textEl.innerHTML = escapeHTML(String(plain));
  }

})().catch((err) => {
  // Falls irgendwas Unerwartetes passiert -> ebenfalls entfernen
  console.warn("Entschlüsselung hard-fail -> Nachricht ausblenden:", err);

  renderedKeys.delete(makeKey(msg));
  li.remove();
  updateMinuteMetaGrouping();
  updateReadIndicators();
});

}



// zeigt "Gelesen" nur, wenn die letzte Nachricht von mir ist UND gelesen wurde
function updateReadIndicators() {
  if (!messageList) return;

  // 1) Meta bei ALLEN eigenen Nachrichten zurück auf ihre gespeicherte Zeit setzen
  messageList.querySelectorAll(".msg.me .meta").forEach((el) => {
    el.textContent = el.dataset.sentTime || "";
  });

  // 2) Letzte Nachricht finden
  const allMessages = [...messageList.querySelectorAll(".msg")];
  if (!allMessages.length) return;

  const lastMsg = allMessages[allMessages.length - 1];

  // 3) Nur wenn die letzte Nachricht von mir ist und gelesen wurde -> " · Gelesen" anhängen
  if (!lastMsg.classList.contains("me")) return;
  if (lastMsg.dataset.read !== "true") return;

  const meta = lastMsg.querySelector(".meta");
  if (meta) {
    const base = meta.dataset.sentTime || "";
    meta.textContent = base ? `${base} · Gelesen` : "Gelesen";
  }
}



// wird bei UPDATE-Events aus Supabase genutzt (read_at ändert sich)
function applyMessageUpdate(msg) {
  if (!msg || !msg.id) return;

  const li = messageList.querySelector(`.msg[data-msg-id="${msg.id}"]`);
  if (!li) return;

  if (msg.read_at) {
    li.dataset.read = "true";
  } else {
    delete li.dataset.read;
  }
  updateReadIndicators();
}

// Wenn der Chat mit dem Absender gerade offen ist und ich Empfänger bin,
// Nachricht sofort als gelesen markieren
async function markAsReadIfVisible(msg) {
  if (!msg || !msg.id) return;

  // Ich bin Empfänger?
  if (msg.receiver_id !== me) return;

  // Aktiver Chat genau mit diesem Absender?
  if (msg.sender_id !== activePeerId) return;

  // Schon gelesen?
  if (msg.read_at) return;

  const { error } = await sb
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", msg.id)
    .is("read_at", null);

  if (error) {
    console.warn("Konnte Nachricht nicht als gelesen markieren:", error);
  }
}


function escapeHTML(s){
  return s.replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function formatTime(iso){
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- Initial laden ---------- */
await initCryptoIdentity();
await ensureRecoveryBackup();
await loadContacts();
await initPresence();
await preloadContactDirectory();


// Globale Press-Pop-Animation für Elemente mit .pressable
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".pressable");
  if (!btn) return;
  btn.classList.remove("pop");
  requestAnimationFrame(() => {
    btn.classList.add("pop");
    btn.addEventListener("animationend", () => btn.classList.remove("pop"), {
      once: true,
    });
  });
});

