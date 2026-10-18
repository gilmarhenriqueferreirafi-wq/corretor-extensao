// Configurações padrão e funções compartilhadas entre background, popup, options e content script.

const DEFAULT_SETTINGS = {
  enabled: true,
  mode: "suggestions", // "auto" | "suggestions"
  language: "pt-BR",
  apiUrl: "https://api.languagetool.org/v2/check",
  debounceMs: 900,
  minTextLength: 3,
  disabledSites: [],
  ignoredWords: []
};

const SUPPORTED_LANGUAGES = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "en-US", label: "Inglês (EUA)" },
  { code: "en-GB", label: "Inglês (Reino Unido)" },
  { code: "es", label: "Espanhol" },
  { code: "fr", label: "Francês" },
  { code: "de-DE", label: "Alemão" },
  { code: "it", label: "Italiano" }
];

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => resolve(items));
  });
}

function saveSettings(partial) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(partial, () => resolve());
  });
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

function normalizeSite(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return getHostname(withProtocol);
  } catch (e) {
    return raw.replace(/^www\./, "").split("/")[0].split(":")[0];
  }
}

function isHostnameDisabled(hostname, disabledSites = []) {
  const host = normalizeSite(hostname);
  return disabledSites.some((site) => {
    const blocked = normalizeSite(site);
    return blocked && (host === blocked || host.endsWith(`.${blocked}`));
  });
}
