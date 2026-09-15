(() => {
  const moreBtn = document.getElementById('routeMoreBtn');
  const moreMenu = document.getElementById('routeMoreMenu');
  const voiceBtn = document.getElementById('voiceSearchBtn');
  const input = document.getElementById('quickAddressInput');

  function closeMoreMenu() {
    if (moreMenu) moreMenu.hidden = true;
  }

  moreBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (moreMenu) moreMenu.hidden = !moreMenu.hidden;
  });

  document.addEventListener('click', (event) => {
    if (!moreMenu || moreMenu.hidden) return;
    if (moreMenu.contains(event.target) || moreBtn?.contains(event.target)) return;
    closeMoreMenu();
  });

  document.getElementById('moreOptimizeBtn')?.addEventListener('click', () => {
    const button = document.getElementById('optimizeBtn');
    if (button && !button.disabled) button.click();
    else if (typeof showToast === 'function') showToast('Sıralamak için en az 2 durak ekle.');
    closeMoreMenu();
  });

  document.getElementById('moreCopyBtn')?.addEventListener('click', () => {
    document.getElementById('copyRouteBtn')?.click();
    closeMoreMenu();
  });

  document.getElementById('moreClearBtn')?.addEventListener('click', () => {
    document.getElementById('clearDoneBtn')?.click();
    closeMoreMenu();
  });

  voiceBtn?.addEventListener('click', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      input?.focus();
      if (typeof showToast === 'function') showToast('Sesli giriş için iPhone klavyesindeki mikrofonu kullan.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    voiceBtn.classList.add('listening');
    if (typeof showToast === 'function') showToast('Dinliyorum…');

    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      if (!text || !input) return;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.form?.requestSubmit();
    };

    recognition.onerror = () => {
      if (typeof showToast === 'function') showToast('Sesli arama başlatılamadı.');
    };

    recognition.onend = () => voiceBtn.classList.remove('listening');
    recognition.start();
  });

  /* Keep the sheet stable when Safari's bottom/keyboard chrome changes the visual viewport. */
  if (window.visualViewport) {
    let raf = 0;
    const syncViewport = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--visual-vh', `${window.visualViewport.height}px`);
      });
    };
    window.visualViewport.addEventListener('resize', syncViewport);
    syncViewport();
  }
})();
