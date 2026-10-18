importScripts("shared.js");

// Instala configurações padrão na primeira execução
chrome.runtime.onInstalled.addListener(async () => {
  const current = await getSettings();
  await saveSettings({ ...DEFAULT_SETTINGS, ...current });
});

// Faz a checagem de texto na API do LanguageTool
async function checkText(text, language, apiUrl) {
  const params = new URLSearchParams();
  params.append("text", text);
  params.append("language", language);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error(`Erro na API do LanguageTool: ${response.status}`);
  }

  const data = await response.json();
  return data.matches || [];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CHECK_TEXT") {
    checkText(message.text, message.language, message.apiUrl)
      .then((matches) => sendResponse({ ok: true, matches }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // resposta assíncrona
  }

  if (message?.type === "GET_SETTINGS") {
    getSettings().then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }
});
