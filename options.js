let localDisabledSites = [];
let localIgnoredWords = [];

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();
  localDisabledSites = [...settings.disabledSites];
  localIgnoredWords = [...(settings.ignoredWords || [])];

  const langEl = document.getElementById("language");
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const opt = document.createElement("option");
    opt.value = lang.code;
    opt.textContent = lang.label;
    langEl.appendChild(opt);
  });
  langEl.value = settings.language;

  document.getElementById("mode").value = settings.mode;
  document.getElementById("debounceMs").value = settings.debounceMs;
  document.getElementById("minTextLength").value = settings.minTextLength;
  document.getElementById("apiUrl").value = settings.apiUrl;

  renderSiteList();
  renderWordList();

  document.getElementById("add-site").addEventListener("click", () => {
    const input = document.getElementById("new-site");
    const site = normalizeSite(input.value);
    if (site && !localDisabledSites.includes(site)) {
      localDisabledSites.push(site);
      input.value = "";
      renderSiteList();
    }
  });

  document.getElementById("add-word").addEventListener("click", addWord);
  document.getElementById("new-word").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWord();
    }
  });

  document.getElementById("save").addEventListener("click", async () => {
    await saveSettings({
      language: langEl.value,
      mode: document.getElementById("mode").value,
      debounceMs: Number(document.getElementById("debounceMs").value) || 900,
      minTextLength: Number(document.getElementById("minTextLength").value) || 3,
      apiUrl: document.getElementById("apiUrl").value.trim(),
      disabledSites: localDisabledSites,
      ignoredWords: localIgnoredWords
    });
    const msg = document.getElementById("saved-msg");
    msg.style.opacity = "1";
    setTimeout(() => (msg.style.opacity = "0"), 1500);
  });
});

function addWord() {
  const input = document.getElementById("new-word");
  const word = input.value.trim();
  if (word && !localIgnoredWords.some((w) => w.toLowerCase() === word.toLowerCase())) {
    localIgnoredWords.push(word);
    input.value = "";
    renderWordList();
  }
}

function renderSiteList() {
  const list = document.getElementById("site-list");
  list.innerHTML = "";
  if (localDisabledSites.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Nenhum site desativado.";
    list.appendChild(empty);
    return;
  }
  localDisabledSites.forEach((site) => {
    const item = document.createElement("div");
    item.className = "site-item";
    item.innerHTML = `<span>${site}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remover";
    removeBtn.onclick = () => {
      localDisabledSites = localDisabledSites.filter((s) => s !== site);
      renderSiteList();
    };
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

function renderWordList() {
  const list = document.getElementById("word-list");
  list.innerHTML = "";
  if (localIgnoredWords.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Nenhuma palavra ou frase ignorada.";
    list.appendChild(empty);
    return;
  }
  localIgnoredWords.forEach((word) => {
    const item = document.createElement("div");
    item.className = "word-item";
    item.innerHTML = `<span>${word}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remover";
    removeBtn.onclick = () => {
      localIgnoredWords = localIgnoredWords.filter((w) => w !== word);
      renderWordList();
    };
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}
