(() => {
  const body = document.body;
  const addButton = document.getElementById('addStopBtn');
  const input = document.getElementById('quickAddressInput');
  const routeSheet = document.getElementById('routeSheet');
  const moreButton = document.getElementById('routeMoreBtn');
  const results = document.getElementById('searchResults');
  const mapPointButton = document.getElementById('useMapPointBtn');
  const pasteButton = document.getElementById('quickPasteBtn');
  const voiceButton = document.getElementById('voiceSearchBtn');

  if (!body || !input || !routeSheet) return;

  let addMode = false;
  const normalPlaceholder = 'Durak eklemek için dokun';

  const tools = document.createElement('div');
  tools.className = 'spoke-add-tools';
  tools.setAttribute('aria-label', 'Durak ekleme seçenekleri');
  tools.innerHTML = `
    <button type="button" class="spoke-add-tool" id="spokeMapTool">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 5.5 8.7 3l6.6 2.5L20.5 3v15.5L15.3 21l-6.6-2.5L3.5 21V5.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.7 3v15.5M15.3 5.5V21" stroke="currentColor" stroke-width="1.8"/></svg>
      <span>Harita</span>
    </button>
    <button type="button" class="spoke-add-tool" id="spokeScanTool">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 9.5h8M8 12h8M9 14.5h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <span>Tara</span>
    </button>
    <button type="button" class="spoke-add-tool" id="spokeVoiceTool">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 0 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="2"/><path d="M5.5 10.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 17.5V21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <span>Ses</span>
    </button>`;
  routeSheet.appendChild(tools);

  function syncKeyboardInset() {
    if (!window.visualViewport) {
      document.documentElement.style.setProperty('--keyboard-inset', '0px');
      return;
    }
    const vv = window.visualViewport;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
    document.documentElement.style.setProperty('--visual-vh', `${vv.height}px`);
  }

  function syncResultsState() {
    const hasResults = !!results && !results.hidden && results.children.length > 0;
    body.classList.toggle('spoke-add-has-results', addMode && hasResults);
  }

  function enterAddMode() {
    if (addMode) return;
    addMode = true;
    body.classList.add('spoke-add-mode');
    input.placeholder = 'Birkaç karakter yaz';
    document.getElementById('routeMoreMenu')?.setAttribute('hidden', '');
    syncKeyboardInset();
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch {}
    });
  }

  function exitAddMode({ keepKeyboard = false } = {}) {
    if (!addMode) return;
    addMode = false;
    body.classList.remove('spoke-add-mode', 'spoke-add-has-results');
    input.placeholder = normalPlaceholder;
    document.documentElement.style.setProperty('--keyboard-inset', '0px');
    if (!keepKeyboard) input.blur();
    if (typeof setSheetLevel === 'function') setSheetLevel('mid');
  }

  addButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    enterAddMode();
  }, true);

  input.addEventListener('focus', () => enterAddMode(), true);

  moreButton?.addEventListener('click', (event) => {
    if (!addMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    exitAddMode();
  }, true);

  document.getElementById('spokeMapTool')?.addEventListener('click', () => {
    exitAddMode();
    setTimeout(() => mapPointButton?.click(), 50);
  });

  document.getElementById('spokeScanTool')?.addEventListener('click', () => {
    pasteButton?.click();
    if (typeof showToast === 'function') showToast('Panodaki adresi alıyorum…');
  });

  document.getElementById('spokeVoiceTool')?.addEventListener('click', () => {
    voiceButton?.click();
  });

  if (results) {
    const observer = new MutationObserver(syncResultsState);
    observer.observe(results, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }

  window.visualViewport?.addEventListener('resize', syncKeyboardInset);
  window.visualViewport?.addEventListener('scroll', syncKeyboardInset);
  window.addEventListener('resize', syncKeyboardInset);
  syncKeyboardInset();
})();
