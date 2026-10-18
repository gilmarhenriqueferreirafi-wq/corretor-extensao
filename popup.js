document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();

  const enabledEl = document.getElementById("enabled");
  const langEl = document.getElementById("language");
  const autoBtn = document.getElementById("mode-auto");
  const suggBtn = document.getElementById("mode-suggestions");

  enabledEl.checked = settings.enabled;
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const opt = document.createElement("option");
    opt.value = lang.code;
    opt.textContent = lang.label;
    langEl.appendChild(opt);
  });
  langEl.value = settings.language;

  function refreshModeButtons(mode) {
    autoBtn.classList.toggle("active", mode === "auto");
    suggBtn.classList.toggle("active", mode === "suggestions");
  }
  refreshModeButtons(settings.mode);

  enabledEl.addEventListener("change", () => {
    saveSettings({ enabled: enabledEl.checked });
  });

  langEl.addEventListener("change", () => {
    saveSettings({ language: langEl.value });
  });

  [autoBtn, suggBtn].forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      refreshModeButtons(mode);
      saveSettings({ mode });
    });
  });

  document.getElementById("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
