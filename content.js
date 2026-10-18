(() => {
  let settings = null;
  let activeEl = null;
  let debounceTimer = null;
  let lastCheckedText = "";
  let currentMatches = [];
  let panelHost = null;
  let panelRoot = null;

  const EDITABLE_SELECTOR =
    'input[type="text"], input[type="search"], input[type="email"], input:not([type]), textarea, [contenteditable="true"], [contenteditable=""]';

  init();

  async function init() {
    settings = await getSettings();
    chrome.storage.onChanged.addListener((changes) => {
      for (const key in changes) {
        settings[key] = changes[key].newValue;
      }
      lastCheckedText = "";
      if (!settings.enabled || isSiteDisabled()) hidePanel();
      else if (activeEl) runCheck(activeEl);
    });

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("blur", onBlur, true);
  }

  function isSiteAllowed() {
    return !isHostnameDisabled(location.hostname, settings.disabledSites);
  }

  function isSiteDisabled() {
    return !isSiteAllowed();
  }

  function onFocusIn(e) {
    if (!settings.enabled || !isSiteAllowed()) return;
    const el = e.target;
    if (el.matches && el.matches(EDITABLE_SELECTOR)) {
      activeEl = el;
    }
  }

  function onBlur(e) {
    if (e.target === activeEl) {
      setTimeout(() => {
        if (document.activeElement !== activeEl) hidePanel();
      }, 200);
    }
  }

  function onInput(e) {
    if (!settings.enabled || !isSiteAllowed()) return;
    const el = e.target;
    if (!el.matches || !el.matches(EDITABLE_SELECTOR)) return;

    activeEl = el;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runCheck(el), settings.debounceMs);
  }

  function getText(el) {
    if (el.isContentEditable) return el.innerText;
    return el.value;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // Retorna a posição do cursor como número de caracteres dentro do texto
  function getCaretOffset(el) {
    if (!el.isContentEditable) {
      return el.selectionStart;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try {
      const range = sel.getRangeAt(0);
      const preRange = range.cloneRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(range.endContainer, range.endOffset);
      return preRange.toString().length;
    } catch (e) {
      return null;
    }
  }

  // Posiciona o cursor numa posição específica (em nº de caracteres) dentro de um contenteditable
  function setCaretOffsetContentEditable(el, offset) {
    const range = document.createRange();
    const sel = window.getSelection();
    let remaining = offset;
    let found = false;

    function walk(node) {
      if (found) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent.length;
        if (remaining <= len) {
          range.setStart(node, remaining);
          range.collapse(true);
          found = true;
        } else {
          remaining -= len;
        }
      } else {
        for (const child of node.childNodes) {
          walk(child);
          if (found) return;
        }
      }
    }
    walk(el);
    if (!found) {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Descobre o início/fim da "palavra" onde uma posição está
  function getWordRangeAt(text, pos) {
    if (pos == null) return null;
    const isWordChar = (c) => c !== undefined && !/\s/.test(c);
    let start = pos;
    let end = pos;
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;
    return { start, end };
  }

  // Define o texto do campo e (opcionalmente) reposiciona o cursor no lugar certo
  function setText(el, text, caretOffset) {
    if (el.isContentEditable) {
      el.innerText = text;
      if (caretOffset != null) {
        try {
          setCaretOffsetContentEditable(el, clamp(caretOffset, 0, text.length));
        } catch (e) {
          /* se falhar, deixa o navegador decidir onde fica o cursor */
        }
      }
    } else {
      el.value = text;
      if (caretOffset != null) {
        try {
          const pos = clamp(caretOffset, 0, text.length);
          el.setSelectionRange(pos, pos);
        } catch (e) {
          /* alguns tipos de input não suportam setSelectionRange */
        }
      }
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Remove qualquer correção que atinja uma palavra/frase da whitelist.
  function filterIgnored(text, matches) {
    const ignored = (settings.ignoredWords || [])
      .map((word) => word.trim().toLocaleLowerCase())
      .filter(Boolean);
    if (ignored.length === 0) return matches;

    const normalizedText = text.toLocaleLowerCase();
    return matches.filter((match) => {
      const matchStart = match.offset;
      const matchEnd = match.offset + match.length;
      return !ignored.some((word) => {
        let fromIndex = 0;
        while (true) {
          const wordStart = normalizedText.indexOf(word, fromIndex);
          if (wordStart < 0) return false;
          const wordEnd = wordStart + word.length;
          if (matchStart < wordEnd && matchEnd > wordStart) return true;
          fromIndex = wordStart + 1;
        }
      });
    });
  }
  async function runCheck(el) {
    const text = getText(el);
    if (!text || text.trim().length < settings.minTextLength) {
      hidePanel();
      return;
    }
    if (text === lastCheckedText) return;
    lastCheckedText = text;

    chrome.runtime.sendMessage(
      {
        type: "CHECK_TEXT",
        text,
        language: settings.language,
        apiUrl: settings.apiUrl
      },
      (response) => {
        if (!response || !response.ok) return;
        if (getText(el) !== text) return; // texto mudou enquanto esperava resposta
        currentMatches = filterIgnored(text, response.matches);
        if (currentMatches.length === 0) {
          hidePanel();
          return;
        }
        if (settings.mode === "auto") {
          applyAutoCorrections(el, text, currentMatches);
        } else {
          showSuggestionsPanel(el, text, currentMatches);
        }
      }
    );
  }

  // ---------- MODO AUTOMÁTICO ----------
  function applyAutoCorrections(el, text, matches) {
    const caretOffset = getCaretOffset(el);
    const activeRange = getWordRangeAt(text, caretOffset);

    // nunca corrige a palavra onde o cursor está agora
    const applicable = matches.filter((match) => {
      if (!match.replacements || match.replacements.length === 0) return false;
      if (!activeRange) return true;
      const overlapsActiveWord =
        match.offset < activeRange.end && match.offset + match.length > activeRange.start;
      return !overlapsActiveWord;
    });

    if (applicable.length === 0) return;

    // aplica da frente pra trás, ajustando o deslocamento do cursor conforme necessário
    const sortedForward = [...applicable].sort((a, b) => a.offset - b.offset);

    let corrected = "";
    let cursor = 0;
    let newCaretOffset = caretOffset;
    let appliedCount = 0;

    for (const match of sortedForward) {
      const best = match.replacements[0].value;
      corrected += text.slice(cursor, match.offset) + best;

      // só desloca o cursor se essa correção acontece ANTES da posição atual dele
      if (caretOffset != null && match.offset + match.length <= caretOffset) {
        newCaretOffset += best.length - match.length;
      }

      cursor = match.offset + match.length;
      appliedCount++;
    }
    corrected += text.slice(cursor);

    if (appliedCount > 0) {
      setText(el, corrected, newCaretOffset);
      lastCheckedText = corrected;
      showBadge(el, `${appliedCount} correção(ões) aplicada(s)`, true);
    }
  }

  // ---------- MODO SUGESTÕES ----------
  function ensurePanel() {
    if (panelHost) return;
    panelHost = document.createElement("div");
    panelHost.id = "__corretor_panel_host";
    panelHost.style.all = "initial";
    panelHost.style.position = "fixed";
    panelHost.style.zIndex = "2147483647";
    panelHost.style.bottom = "16px";
    panelHost.style.right = "16px";
    document.documentElement.appendChild(panelHost);
    panelRoot = panelHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      .panel {
        font-family: system-ui, sans-serif;
        width: 320px;
        max-height: 360px;
        overflow-y: auto;
        background: #1e1e24;
        color: #f2f2f5;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        padding: 10px;
      }
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 8px;
        color: #a7a7b3;
      }
      .panel-header button {
        background: none;
        border: none;
        color: #a7a7b3;
        cursor: pointer;
        font-size: 14px;
      }
      .item {
        background: #2a2a33;
        border-radius: 8px;
        padding: 8px 10px;
        margin-bottom: 6px;
      }
      .item .msg {
        font-size: 12px;
        color: #d5d5db;
        margin-bottom: 6px;
      }
      .item .orig {
        text-decoration: underline wavy #e05d5d;
      }
      .suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .suggestions button {
        background: #3d5afe;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
      }
      .suggestions button:hover {
        background: #536dfe;
      }
      .ignore-btn {
        background: none !important;
        color: #a7a7b3 !important;
        text-decoration: underline;
      }
    `;
    panelRoot.appendChild(style);
  }

  function showSuggestionsPanel(el, text, matches) {
    ensurePanel();
    panelRoot.querySelector(".panel")?.remove();

    const panel = document.createElement("div");
    panel.className = "panel";

    const header = document.createElement("div");
    header.className = "panel-header";
    header.innerHTML = `<span>${matches.length} sugestão(ões)</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.onclick = hidePanel;
    header.appendChild(closeBtn);
    panel.appendChild(header);

    matches.forEach((match) => {
      const item = document.createElement("div");
      item.className = "item";

      const original = text.slice(match.offset, match.offset + match.length);
      const msg = document.createElement("div");
      msg.className = "msg";
      msg.innerHTML = `<span class="orig">${escapeHtml(original)}</span> — ${escapeHtml(
        match.message
      )}`;
      item.appendChild(msg);

      const sugg = document.createElement("div");
      sugg.className = "suggestions";

      if (match.replacements && match.replacements.length > 0) {
        match.replacements.slice(0, 4).forEach((rep) => {
          const btn = document.createElement("button");
          btn.textContent = rep.value;
          btn.onclick = () => applySingleReplacement(el, match, rep.value);
          sugg.appendChild(btn);
        });
      }

      const ignoreBtn = document.createElement("button");
      ignoreBtn.textContent = "Ignorar sempre";
      ignoreBtn.className = "ignore-btn";
      ignoreBtn.onclick = () => ignoreWord(el, original);
      sugg.appendChild(ignoreBtn);

      item.appendChild(sugg);
      panel.appendChild(item);
    });

    panelRoot.appendChild(panel);
  }

  function applySingleReplacement(el, match, replacementValue) {
    const text = getText(el);
    const start = match.offset;
    const end = match.offset + match.length;
    const corrected = text.slice(0, start) + replacementValue + text.slice(end);
    const newCaret = start + replacementValue.length;
    setText(el, corrected, newCaret);
    lastCheckedText = corrected;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runCheck(el), 300);
  }

  async function ignoreWord(el, word) {
    const trimmed = word.trim();
    if (!trimmed) return;
    const current = settings.ignoredWords || [];
    if (!current.some((w) => w.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...current, trimmed];
      settings.ignoredWords = updated;
      await saveSettings({ ignoredWords: updated });
    }
    hidePanel();
    lastCheckedText = "";
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runCheck(el), 200);
  }

  function showBadge(el, message, autoHide) {
    ensurePanel();
    panelRoot.querySelector(".panel")?.remove();
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.style.width = "auto";
    panel.style.fontSize = "12px";
    panel.textContent = message;
    panelRoot.appendChild(panel);
    if (autoHide) setTimeout(hidePanel, 2500);
  }

  function hidePanel() {
    if (panelRoot) {
      const p = panelRoot.querySelector(".panel");
      if (p) p.remove();
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
