function setupEmailLinks() {
  document.querySelectorAll("[data-email]").forEach((el) => {
    const user1 = "yu";
    const user2 = "ov";
    const domain1 = "ukr";
    const domain2 = "net";
    const email = `${user2}${user1}@${domain1}.${domain2}`;

    el.textContent = email;
    el.href = `mailto:${email}`;

    el.addEventListener("click", (event) => {
      event.preventDefault();
      navigator.clipboard.writeText(email);
      alert("Email copied to clipboard");
    });
  });
}

function normalizeUserName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function base64UrlToBytes(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...arrays) {
  const length = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  arrays.forEach((arr) => {
    out.set(arr, offset);
    offset += arr.length;
  });
  return out;
}

function equalBytes(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, dataBytes);
  return new Uint8Array(signature);
}

async function deriveKeys(secret, saltBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations: 250000
    },
    baseKey,
    512
  );
  const keyMaterial = new Uint8Array(derivedBits);
  return {
    encKey: keyMaterial.slice(0, 32),
    macKey: keyMaterial.slice(32, 64)
  };
}

async function buildKeystream(encKey, nonce, length) {
  const stream = new Uint8Array(length);
  let written = 0;
  let counter = 0;

  while (written < length) {
    const counterBytes = new Uint8Array(8);
    const view = new DataView(counterBytes.buffer);
    view.setUint32(4, counter, false);
    const blockInput = concatBytes(nonce, counterBytes);
    const block = await hmacSha256(encKey, blockInput);
    const take = Math.min(block.length, length - written);
    stream.set(block.slice(0, take), written);
    written += take;
    counter += 1;
  }

  return stream;
}

async function decryptPayload(encodedPayload, secret) {
  const packed = base64UrlToBytes(encodedPayload.trim());
  if (packed.length < 4 + 16 + 16 + 32 + 1) {
    throw new Error("Payload is too short");
  }

  const magic = new TextDecoder().decode(packed.slice(0, 4));
  if (magic !== "ENC1") {
    throw new Error("Unsupported payload format");
  }

  const salt = packed.slice(4, 20);
  const nonce = packed.slice(20, 36);
  const tag = packed.slice(36, 68);
  const cipher = packed.slice(68);
  const header = packed.slice(0, 36);

  const { encKey, macKey } = await deriveKeys(secret, salt);
  const computedTag = await hmacSha256(macKey, concatBytes(header, cipher));
  if (!equalBytes(tag, computedTag.slice(0, tag.length))) {
    throw new Error("Authentication failed");
  }

  const stream = await buildKeystream(encKey, nonce, cipher.length);
  const plainBytes = new Uint8Array(cipher.length);
  for (let i = 0; i < cipher.length; i += 1) {
    plainBytes[i] = cipher[i] ^ stream[i];
  }

  return new TextDecoder().decode(plainBytes);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

function getPageDirectoryPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length > 0) {
    segments.pop();
  }
  return `/${segments.join("/")}${segments.length ? "/" : "/"}`;
}

function buildEncryptedCandidatePaths(discipline, user) {
  const fileName = `${discipline}_${user}_encripted.html`;
  const rawSegments = window.location.pathname.split("/").filter(Boolean);
  const segments = [...rawSegments];

  if (segments.length > 0) {
    const last = segments[segments.length - 1].toLowerCase();
    if (last.endsWith(".html")) {
      segments.pop();
    } else if (last === discipline.toLowerCase()) {
      segments.pop();
    }
  }

  const basePath = `/${segments.join("/")}${segments.length ? "/" : "/"}`;
  const candidates = [new URL(`${basePath}${fileName}`, window.location.origin).toString()];

  if (window.location.pathname.endsWith("/")) {
    const fallbackDir = getPageDirectoryPath();
    const fallbackUrl = new URL(`${fallbackDir}${fileName}`, window.location.origin).toString();
    if (!candidates.includes(fallbackUrl)) {
      candidates.push(fallbackUrl);
    }
  }

  return candidates;
}

async function fetchEncryptedVariant(discipline, user) {
  if (window.location.protocol === "file:") {
    throw new Error("Open the site via HTTP(S), not file://");
  }

  const candidates = buildEncryptedCandidatePaths(discipline, user);
  let lastError = "No candidate URL succeeded";

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = `HTTP ${response.status} for ${url}`;
        continue;
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const payloadNode = doc.querySelector(
        "pre.encrypted > code, pre.sourceCode.encrypted > code, code.sourceCode.encrypted, code.language-encrypted"
      );
      const hashNode = doc.querySelector(".encrypted-payload-meta[data-encrypted-payload-sha256]");

      if (!payloadNode || !hashNode) {
        lastError = `Encrypted payload missing in ${url}`;
        continue;
      }

      return {
        payload: (payloadNode.textContent || "").trim(),
        expectedHash: hashNode.getAttribute("data-encrypted-payload-sha256") || ""
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

function setPublicMode() {
  document.querySelectorAll(".public-content").forEach((el) => {
    el.style.display = "";
  });
  document.querySelectorAll(".encrypted-section-block").forEach((el) => {
    el.style.display = "none";
  });
}

function setEncryptedMode(plaintext) {
  document.querySelectorAll(".public-content").forEach((el) => {
    el.style.display = "none";
  });
  document.querySelectorAll(".encrypted-section-block").forEach((el) => {
    el.style.display = "";
    const target = el.querySelector(".encrypted-section-content");
    if (target) {
      target.textContent = plaintext;
    }
  });
}

async function tryUnlockWithCredentials(discipline, user, code, persist) {
  const normalizedUser = normalizeUserName(user);
  if (!normalizedUser || !code) {
    return { ok: false, reason: "Missing username or code" };
  }

  try {
    const variant = await fetchEncryptedVariant(discipline, normalizedUser);
    const plaintext = await decryptPayload(variant.payload, code);
    const digest = await sha256Hex(plaintext);
    if (variant.expectedHash && digest !== variant.expectedHash) {
      return { ok: false, reason: "Hash mismatch" };
    }

    if (persist) {
      localStorage.setItem(`courseAccessCode:${discipline}`, code);
      localStorage.setItem(`courseAccessUser:${discipline}`, normalizedUser);
    }
    setEncryptedMode(plaintext);
    return { ok: true, reason: "" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Unknown error" };
  }
}

function createAccessModal() {
  const overlay = document.createElement("div");
  overlay.className = "encrypted-access-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.55)";
  overlay.style.display = "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "2000";

  const modal = document.createElement("div");
  modal.className = "encrypted-access-modal";
  modal.style.background = "#fff";
  modal.style.color = "#111";
  modal.style.width = "min(92vw, 420px)";
  modal.style.borderRadius = "10px";
  modal.style.padding = "16px";
  modal.style.boxShadow = "0 20px 50px rgba(0,0,0,0.3)";

  const title = document.createElement("h3");
  title.textContent = "Authorized Access";
  title.style.margin = "0 0 12px 0";
  title.style.fontSize = "1.1rem";

  const form = document.createElement("form");
  form.className = "encrypted-access-form";
  form.style.display = "grid";
  form.style.gap = "10px";

  const userInput = document.createElement("input");
  userInput.type = "text";
  userInput.name = "username";
  userInput.placeholder = "Username";
  userInput.autocomplete = "username";
  userInput.required = true;
  userInput.style.padding = "8px";

  const codeInput = document.createElement("input");
  codeInput.type = "password";
  codeInput.name = "access_code";
  codeInput.placeholder = "Access code";
  codeInput.autocomplete = "off";
  codeInput.required = true;
  codeInput.style.padding = "8px";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const unlockBtn = document.createElement("button");
  unlockBtn.type = "submit";
  unlockBtn.textContent = "Unlock";
  unlockBtn.style.padding = "8px 14px";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.padding = "8px 14px";

  const status = document.createElement("div");
  status.className = "encrypted-access-status";
  status.style.fontSize = "0.9rem";

  actions.appendChild(unlockBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(userInput);
  form.appendChild(codeInput);
  form.appendChild(actions);
  form.appendChild(status);

  modal.appendChild(title);
  modal.appendChild(form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => {
    overlay.style.display = "none";
    status.textContent = "";
  };

  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  return { overlay, form, userInput, codeInput, status, closeModal };
}

function hideAccessInfo(trigger) {
  const accessInfo = trigger.closest(".access-info");
  if (accessInfo) {
    accessInfo.style.display = "none";
  }
}

function setupEncryptedAccess() {
  const trigger = document.querySelector(".full-access-trigger[data-access-discipline]");
  const encryptedBlocks = document.querySelectorAll(".encrypted-section-block");
  if (!trigger || encryptedBlocks.length === 0) {
    return;
  }

  encryptedBlocks.forEach((el) => {
    el.style.display = "none";
  });

  const discipline = trigger.getAttribute("data-access-discipline");
  if (!discipline) {
    return;
  }

  const modal = createAccessModal();
  setPublicMode();

  const storedUser = localStorage.getItem(`courseAccessUser:${discipline}`) || "";
  const storedCode = localStorage.getItem(`courseAccessCode:${discipline}`) || "";

  if (storedUser && storedCode) {
    modal.userInput.value = storedUser;
    tryUnlockWithCredentials(discipline, storedUser, storedCode, false).then((result) => {
      if (!result.ok) {
        localStorage.removeItem(`courseAccessCode:${discipline}`);
        localStorage.removeItem(`courseAccessUser:${discipline}`);
        setPublicMode();
      } else {
        hideAccessInfo(trigger);
      }
    });
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    modal.overlay.style.display = "flex";
    modal.userInput.focus();
  });

  modal.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    modal.status.textContent = "Checking credentials...";

    const result = await tryUnlockWithCredentials(
      discipline,
      modal.userInput.value,
      modal.codeInput.value.trim(),
      true
    );

    if (!result.ok) {
      modal.status.textContent = `Invalid username or access code (${result.reason})`;
      setPublicMode();
      return;
    }

    hideAccessInfo(trigger);
    modal.closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      modal.closeModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupEmailLinks();
  setupEncryptedAccess();
});
