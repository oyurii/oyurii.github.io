const SUPPORTED_LANGS = ["en", "uk"];
const ENCRYPTED_PENDING_CLASS = "encrypted-content-pending";

// Added in <head> before page content is parsed to prevent flash of public text on protected pages.
document.documentElement.classList.add(ENCRYPTED_PENDING_CLASS);

const LANG_KEY = "site_lang";

function isUkrainianUi() {
  return (getCurrentLangFromPath() || getPreferredLang()) === "uk";
}

function t(enText, ukText) {
  return isUkrainianUi() ? ukText : enText;
}

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
      alert(t("Email copied to clipboard", "Email скопійовано в буфер обміну"));
    });
  });
}

function getCurrentLangFromPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const idx = segments.findIndex((s) => SUPPORTED_LANGS.includes(s));
  return idx >= 0 ? segments[idx] : "";
}

function getPreferredLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && SUPPORTED_LANGS.includes(saved)) {
    return saved;
  }
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("uk") ? "uk" : "en";
}

function buildPathForLang(targetLang) {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const hasFile = segments.length > 0 && segments[segments.length - 1].includes(".");
  const hadTrailingSlash = window.location.pathname.endsWith("/");
  const langIdx = segments.findIndex((s) => SUPPORTED_LANGS.includes(s));

  if (langIdx >= 0) {
    segments[langIdx] = targetLang;
  } else if (hasFile) {
    segments.splice(Math.max(segments.length - 1, 0), 0, targetLang);
  } else {
    segments.push(targetLang);
  }

  let path = `/${segments.join("/")}`;
  if (!hasFile && hadTrailingSlash && !path.endsWith("/")) {
    path += "/";
  }
  return `${path}${window.location.search}${window.location.hash}`;
}

function buildLanguagePathCandidates(targetLang) {
  const candidates = [];
  const primary = buildPathForLang(targetLang);
  candidates.push(primary);

  if (primary.startsWith("/docs/")) {
    candidates.push(primary.replace(/^\/docs/, ""));
  } else {
    candidates.push(`/docs${primary}`);
  }

  return [...new Set(candidates)];
}

async function pathExists(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

async function setupLanguageRouting() {
  if (window.location.protocol === "file:") {
    return;
  }

  const preferred = getPreferredLang();
  localStorage.setItem(LANG_KEY, preferred);

  const currentLang = getCurrentLangFromPath();
  if (!currentLang) {
    const candidates = buildLanguagePathCandidates(preferred);
    for (const candidate of candidates) {
      // Avoid loop in edge setups.
      if (candidate === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        continue;
      }
      if (await pathExists(candidate)) {
        window.location.replace(candidate);
        return;
      }
    }
    return;
  }

  if (currentLang !== preferred) {
    const candidates = buildLanguagePathCandidates(preferred);
    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        window.location.replace(candidate);
        return;
      }
    }
  }
}

function setupLanguageSwitcher() {
  const navList =
    document.querySelector(".navbar .navbar-nav.navbar-nav-scroll.ms-auto") ||
    document.querySelector(".navbar .navbar-nav");
  if (!navList || document.querySelector(".lang-switcher-item")) {
    return;
  }

  const currentLang = getCurrentLangFromPath() || getPreferredLang();
  const item = document.createElement("li");
  item.className = "nav-item lang-switcher-item d-flex align-items-center";

  const en = document.createElement("a");
  en.href = buildPathForLang("en");
  en.className = "nav-link px-1";
  en.textContent = "EN";

  const sep = document.createElement("span");
  sep.className = "nav-link px-0";
  sep.textContent = "/";

  const uk = document.createElement("a");
  uk.href = buildPathForLang("uk");
  uk.className = "nav-link px-1";
  uk.textContent = "UK";

  if (currentLang === "en") {
    en.style.fontWeight = "700";
  }
  if (currentLang === "uk") {
    uk.style.fontWeight = "700";
  }

  const onClick = (lang) => (event) => {
    event.preventDefault();
    localStorage.setItem(LANG_KEY, lang);
    window.location.href = buildPathForLang(lang);
  };

  en.addEventListener("click", onClick("en"));
  uk.addEventListener("click", onClick("uk"));

  item.appendChild(en);
  item.appendChild(sep);
  item.appendChild(uk);
  navList.appendChild(item);
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
    throw new Error(t("Payload is too short", "Зашифровані дані занадто короткі"));
  }

  const magic = new TextDecoder().decode(packed.slice(0, 4));
  if (magic !== "ENC1") {
    throw new Error(t("Unsupported payload format", "Непідтримуваний формат зашифрованих даних"));
  }

  const salt = packed.slice(4, 20);
  const nonce = packed.slice(20, 36);
  const tag = packed.slice(36, 68);
  const cipher = packed.slice(68);
  const header = packed.slice(0, 36);

  const { encKey, macKey } = await deriveKeys(secret, salt);
  const computedTag = await hmacSha256(macKey, concatBytes(header, cipher));
  if (!equalBytes(tag, computedTag.slice(0, tag.length))) {
    throw new Error(t("Authentication failed", "Перевірка автентичності не пройшла"));
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
  const rawSegments = window.location.pathname.split("/").filter(Boolean);
  const segments = [...rawSegments];
  const langIdx = segments.findIndex((s) => SUPPORTED_LANGS.includes(s));
  let pageStem = "index";

  if (segments.length > 0) {
    const last = segments[segments.length - 1].toLowerCase();
    if (last.endsWith(".html")) {
      pageStem = last.replace(/\.html$/i, "");
      segments.pop();
    } else if (last === discipline.toLowerCase()) {
      pageStem = last;
      segments.pop();
    } else if (window.location.pathname.endsWith("/")) {
      pageStem = "index";
    } else {
      pageStem = last;
    }
  }
  const fileName = `${pageStem}_${user}_encripted.html`;

  const baseVariants = [];
  baseVariants.push([...segments]);

  if (langIdx >= 0) {
    SUPPORTED_LANGS.forEach((lang) => {
      const variant = [...segments];
      variant[langIdx] = lang;
      baseVariants.push(variant);
    });
  }

  const candidates = [];
  baseVariants.forEach((parts) => {
    const basePath = `/${parts.join("/")}${parts.length ? "/" : "/"}`;
    const url = new URL(`${basePath}${fileName}`, window.location.origin).toString();
    if (!candidates.includes(url)) {
      candidates.push(url);
    }
  });

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
    throw new Error(t("Open the site via HTTP(S), not file://", "Відкрийте сайт через HTTP(S), а не file://"));
  }

  const candidates = buildEncryptedCandidatePaths(discipline, user);
  let lastError = t("No candidate URL succeeded", "Не вдалося отримати дані за жодним із можливих URL");

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
        lastError = t(`Encrypted payload missing in ${url}`, `Зашифровані дані відсутні за адресою ${url}`);
        continue;
      }

      return {
        payload: (payloadNode.textContent || "").trim(),
        expectedHash: hashNode.getAttribute("data-encrypted-payload-sha256") || "",
        payloadFormat: hashNode.getAttribute("data-encrypted-payload-format") || "markdown"
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

function clearEncryptedPendingState() {
  document.documentElement.classList.remove(ENCRYPTED_PENDING_CLASS);
}

function setPublicMode() {
  document.querySelectorAll(".public-content").forEach((el) => {
    el.style.display = "";
  });
  document.querySelectorAll(".encrypted-section-block").forEach((el) => {
    el.style.display = "none";
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rewriteClientMarkdownLinks(url) {
  if (!url) {
    return url;
  }
  if (/^[a-z]+:/i.test(url) || url.startsWith("#") || url.startsWith("mailto:")) {
    return url;
  }

  const parts = url.split("#");
  const path = parts[0];
  const fragment = parts.length > 1 ? `#${parts.slice(1).join("#")}` : "";
  if (/\.qmd$/i.test(path)) {
    return `${path.replace(/\.qmd$/i, ".html")}${fragment}`;
  }
  return url;
}

function inlineMarkdownToHtml(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    return `<img src="${rewriteClientMarkdownLinks(url)}" alt="${alt}">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    return `<a href="${rewriteClientMarkdownLinks(url)}">${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  return html;
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false;
  let codeLang = "";
  let listType = null;
  let inBlockquote = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inlineMarkdownToHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const closeList = () => {
    if (listType) {
      out.push(listType === "ol" ? "</ol>" : "</ul>");
      listType = null;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      flushParagraph();
      closeList();
      out.push("</blockquote>");
      inBlockquote = false;
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine;

    const fenceMatch = line.match(/^```([^`]*)$/);
    if (fenceMatch) {
      flushParagraph();
      closeList();
      closeBlockquote();
      if (!inCode) {
        inCode = true;
        codeLang = (fenceMatch[1] || "").trim();
        out.push(
          `<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ""}>`
        );
      } else {
        inCode = false;
        codeLang = "";
        out.push("</code></pre>");
      }
      return;
    }

    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      closeBlockquote();
      return;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      if (!inBlockquote) {
        flushParagraph();
        closeList();
        out.push("<blockquote>");
        inBlockquote = true;
      }
      const quoteText = quoteMatch[1];
      if (quoteText.trim()) {
        paragraph.push(quoteText.trim());
      } else {
        flushParagraph();
      }
      return;
    }

    closeBlockquote();

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inlineMarkdownToHtml(headingMatch[2].trim())}</h${level}>`);
      return;
    }

    const hrMatch = line.match(/^[-*_]{3,}\s*$/);
    if (hrMatch) {
      flushParagraph();
      closeList();
      out.push("<hr>");
      return;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (olMatch || ulMatch) {
      flushParagraph();
      const nextListType = olMatch ? "ol" : "ul";
      if (listType && listType !== nextListType) {
        closeList();
      }
      if (!listType) {
        listType = nextListType;
        out.push(listType === "ol" ? "<ol>" : "<ul>");
      }
      out.push(`<li>${inlineMarkdownToHtml((olMatch || ulMatch)[1].trim())}</li>`);
      return;
    }

    paragraph.push(line.trim());
  });

  flushParagraph();
  closeList();
  closeBlockquote();
  if (inCode) {
    out.push("</code></pre>");
  }

  return out.join("\n");
}

function setEncryptedMode(plaintext, payloadFormat = "markdown") {
  document.querySelectorAll(".public-content").forEach((el) => {
    el.style.display = "none";
  });
  document.querySelectorAll(".encrypted-section-block").forEach((el) => {
    el.style.display = "";
    const target = el.querySelector(".encrypted-section-content");
    if (target) {
      if (payloadFormat === "html") {
        target.innerHTML = plaintext;
      } else {
        target.innerHTML = markdownToHtml(plaintext);
      }
    }
  });
}

function isDisciplineLandingPage(discipline) {
  const path = window.location.pathname.replace(/\/+$/, "");
  const patterns = [
    new RegExp(`/${discipline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    new RegExp(`/${discipline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.html$`, "i")
  ];
  return patterns.some((rx) => rx.test(path));
}

function buildDisciplineMaterialsIndexPath(discipline) {
  const path = window.location.pathname;
  if (path.endsWith(".html")) {
    return path.replace(new RegExp(`${discipline}\\.html$`, "i"), `${discipline}-materials/index.html`);
  }
  const normalized = path.endsWith("/") ? path : `${path}/`;
  return `${normalized}${discipline}-materials/index.html`;
}

async function tryUnlockWithCredentials(discipline, user, code, persist, options = {}) {
  const applyContent = options.applyContent !== false;
  const normalizedUser = normalizeUserName(user);
  if (!normalizedUser || !code) {
    return { ok: false, reason: t("Missing username or code", "Не вказано ім'я користувача або код доступу") };
  }

  try {
    const variant = await fetchEncryptedVariant(discipline, normalizedUser);
    const plaintext = await decryptPayload(variant.payload, code);
    const digest = await sha256Hex(plaintext);
    if (variant.expectedHash && digest !== variant.expectedHash) {
      return { ok: false, reason: t("Hash mismatch", "Контрольна сума не збігається") };
    }

    if (persist) {
      localStorage.setItem(`courseAccessCode:${discipline}`, code);
      localStorage.setItem(`courseAccessUser:${discipline}`, normalizedUser);
    }
    if (applyContent) {
      setEncryptedMode(plaintext, variant.payloadFormat);
    }
    return { ok: true, reason: "", payloadFormat: variant.payloadFormat };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : t("Unknown error", "Невідома помилка")
    };
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
  title.className = "encrypted-access-title";
  title.textContent = t("Authorized Access", "Авторизований доступ");

  const form = document.createElement("form");
  form.className = "encrypted-access-form";
  form.style.display = "grid";
  form.style.gap = "10px";

  const userInput = document.createElement("input");
  userInput.className = "encrypted-access-input";
  userInput.type = "text";
  userInput.name = "username";
  userInput.placeholder = t("Username", "Ім'я користувача");
  userInput.autocomplete = "username";
  userInput.required = true;
  const codeInput = document.createElement("input");
  codeInput.className = "encrypted-access-input";
  codeInput.type = "password";
  codeInput.name = "access_code";
  codeInput.placeholder = t("Access code", "Код доступу");
  codeInput.autocomplete = "off";
  codeInput.required = true;
  const actions = document.createElement("div");
  actions.className = "encrypted-access-actions";
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const unlockBtn = document.createElement("button");
  unlockBtn.className = "encrypted-access-btn encrypted-access-btn-primary";
  unlockBtn.type = "submit";
  unlockBtn.textContent = t("Unlock", "Відкрити");

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "encrypted-access-btn encrypted-access-btn-secondary";
  cancelBtn.type = "button";
  cancelBtn.textContent = t("Cancel", "Скасувати");

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

function shouldForgetStoredCredentials(reason) {
  const msg = (reason || "").toLowerCase();
  return msg.includes("authentication failed") || msg.includes("hash mismatch");
}

function setupEncryptedAccess() {
  const trigger = document.querySelector(".full-access-trigger[data-access-discipline]");
  const encryptedBlocks = document.querySelectorAll(".encrypted-section-block");
  if (!trigger || encryptedBlocks.length === 0) {
    clearEncryptedPendingState();
    return;
  }

  encryptedBlocks.forEach((el) => {
    el.style.display = "none";
  });

  const discipline = trigger.getAttribute("data-access-discipline");
  if (!discipline) {
    clearEncryptedPendingState();
    return;
  }

  const modal = createAccessModal();

  const storedUser = localStorage.getItem(`courseAccessUser:${discipline}`) || "";
  const storedCode = localStorage.getItem(`courseAccessCode:${discipline}`) || "";
  const shouldRedirectLanding = isDisciplineLandingPage(discipline);

  if (storedUser && storedCode) {
    modal.userInput.value = storedUser;
    tryUnlockWithCredentials(discipline, storedUser, storedCode, false, { applyContent: !shouldRedirectLanding }).then((result) => {
      if (!result.ok) {
        if (shouldForgetStoredCredentials(result.reason)) {
          localStorage.removeItem(`courseAccessCode:${discipline}`);
          localStorage.removeItem(`courseAccessUser:${discipline}`);
        }
        setPublicMode();
        clearEncryptedPendingState();
      } else {
        hideAccessInfo(trigger);
        if (shouldRedirectLanding) {
          window.location.replace(buildDisciplineMaterialsIndexPath(discipline));
          return;
        }
        clearEncryptedPendingState();
      }
    });
  } else {
    setPublicMode();
    clearEncryptedPendingState();
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    modal.overlay.style.display = "flex";
    modal.userInput.focus();
  });

  modal.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    modal.status.textContent = t("Checking credentials...", "Перевірка облікових даних...");

    const result = await tryUnlockWithCredentials(
      discipline,
      modal.userInput.value,
      modal.codeInput.value.trim(),
      true,
      { applyContent: !shouldRedirectLanding }
    );

    if (!result.ok) {
      modal.status.textContent = t(
        `Invalid username or access code (${result.reason})`,
        `Неправильне ім'я користувача або код доступу (${result.reason})`
      );
      setPublicMode();
      return;
    }

    if (shouldRedirectLanding) {
      window.location.replace(buildDisciplineMaterialsIndexPath(discipline));
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
  try {
    setupLanguageRouting();
    setupLanguageSwitcher();
    setupEmailLinks();
    setupEncryptedAccess();
  } catch (error) {
    clearEncryptedPendingState();
    throw error;
  }
});
