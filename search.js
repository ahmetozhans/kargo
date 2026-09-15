const bursaResultsBox = document.getElementById('searchResults');
const bursaForm = document.getElementById('quickAddForm');
const bursaInput = document.getElementById('quickAddressInput');
const bursaButton = document.getElementById('quickAddBtn');

const LEARNED_PLACES_KEY = 'kargo-learned-bursa-places-v1';

let bursaResults = [];
let latestQuery = '';
let poiIndex = [];
let poiReady = false;
let poiFailed = false;

function normalizeText(value = '') {
  return String(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function hideBursaResults() {
  bursaResults = [];
  bursaResultsBox?.replaceChildren();
  if (bursaResultsBox) bursaResultsBox.hidden = true;
}

function showBursaMessage(title, detail = '') {
  if (!bursaResultsBox) return;
  bursaResultsBox.replaceChildren();
  bursaResultsBox.hidden = false;

  const box = document.createElement('div');
  box.className = 'search-empty';

  const strong = document.createElement('strong');
  strong.textContent = title;
  box.append(strong);

  if (detail) {
    const span = document.createElement('span');
    span.textContent = detail;
    box.append(span);
  }

  bursaResultsBox.append(box);
}

function renderBursaResults(rows, sourceLabel = 'Bursa işletme listesi') {
  if (!bursaResultsBox) return;
  bursaResultsBox.replaceChildren();
  bursaResultsBox.hidden = false;

  if (!rows.length) {
    showBursaMessage('Bursa’da bulamadım.', 'Firma adı çıkmıyorsa açık adresi yazıp klavyedeki Ara tuşuna bas.');
    return;
  }

  const head = document.createElement('div');
  head.className = 'search-head';
  head.textContent = `${rows.length} Bursa sonucu`;
  bursaResultsBox.append(head);

  rows.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result';
    button.dataset.index = String(index);

    const main = document.createElement('span');
    main.className = 'search-result-main';

    const name = document.createElement('strong');
    name.textContent = item.name;

    const address = document.createElement('span');
    address.textContent = item.address;

    main.append(name, address);

    const add = document.createElement('span');
    add.className = 'search-add';
    add.textContent = '+';

    button.append(main, add);
    bursaResultsBox.append(button);
  });

  const source = document.createElement('div');
  source.textContent = `Arama: ${sourceLabel}`;
  source.style.padding = '6px 8px 4px';
  source.style.fontSize = '9px';
  source.style.color = '#98a3b7';
  source.style.textAlign = 'right';
  bursaResultsBox.append(source);
}

function scoreLocal(item, query) {
  const name = item._name;
  const address = item._address;
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  if (address.includes(query)) return 4;
  return 99;
}

function indexItem(row, provider = 'local') {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  return {
    provider: row.provider || provider,
    name: row.n || row.name || 'Bursa durağı',
    address: row.a || row.address || 'Bursa',
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    _name: normalizeText(row.n || row.name || ''),
    _address: normalizeText(row.a || row.address || ''),
  };
}

function loadLearnedPlaces() {
  try {
    const rows = JSON.parse(localStorage.getItem(LEARNED_PLACES_KEY) || '[]');
    return Array.isArray(rows) ? rows.map((row) => indexItem(row, 'learned')) : [];
  } catch {
    localStorage.removeItem(LEARNED_PLACES_KEY);
    return [];
  }
}

function mergeIndexRows(...groups) {
  const merged = [];
  const seen = new Set();
  groups.flat().forEach((item) => {
    const key = `${item._name}|${item._address}`;
    if (!item._name || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

function rememberPlace(item) {
  if (!item?.name || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) return;
  const saved = loadLearnedPlaces();
  const candidate = indexItem({
    provider: 'learned',
    name: item.name,
    address: item.address,
    lat: Number(item.lat),
    lng: Number(item.lng),
  }, 'learned');

  const key = `${candidate._name}|${candidate._address}`;
  const next = [candidate, ...saved.filter((row) => `${row._name}|${row._address}` !== key)].slice(0, 250);

  localStorage.setItem(LEARNED_PLACES_KEY, JSON.stringify(next.map((row) => ({
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
  }))));

  poiIndex = mergeIndexRows(next, poiIndex);
}

function searchLocalBusinesses(query) {
  if (!poiReady || !poiIndex.length) return [];
  const q = normalizeText(query.trim());
  if (q.length < 3) return [];

  return poiIndex
    .map((item) => ({ item, score: scoreLocal(item, q) }))
    .filter((entry) => entry.score < 99)
    .sort((a, b) => {
      if (a.item.provider === 'learned' && b.item.provider !== 'learned') return -1;
      if (b.item.provider === 'learned' && a.item.provider !== 'learned') return 1;
      return entryCompare(a, b);
    })
    .slice(0, 8)
    .map((entry) => entry.item);
}

function entryCompare(a, b) {
  return a.score - b.score
    || a.item.name.length - b.item.name.length
    || a.item.name.localeCompare(b.item.name, 'tr');
}

const poiLoadPromise = fetch('./bursa-poi.json?v=17', { cache: 'force-cache' })
  .then((response) => {
    if (!response.ok) throw new Error('poi-index');
    return response.json();
  })
  .then((rows) => {
    const builtIndex = (Array.isArray(rows) ? rows : []).map((row) => indexItem(row, 'local'));
    poiIndex = mergeIndexRows(loadLearnedPlaces(), builtIndex);
    poiReady = true;
    return poiIndex;
  })
  .catch(() => {
    poiFailed = true;
    poiReady = true;
    poiIndex = loadLearnedPlaces();
    return poiIndex;
  });

async function findWithNominatim(query) {
  const q = normalizeText(query).includes('bursa') ? query : `${query}, Bursa`;
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '8',
    countrycodes: 'tr',
    addressdetails: '1',
    namedetails: '1',
    viewbox: '28.0,40.82,30.35,39.18',
    bounded: '1',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { 'Accept-Language': 'tr' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Adres araması yapılamadı.');

    const rows = await response.json();
    return rows
      .filter((item) => normalizeText(item.display_name || '').includes('bursa'))
      .slice(0, 8)
      .map((item) => ({
        provider: 'nominatim',
        name: item.namedetails?.name || item.name || item.display_name?.split(',')[0] || 'Bursa durağı',
        address: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
      }));
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePlacePoint(item) {
  if (Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))) return item;

  let rows = await findWithNominatim(item.address || item.name);
  if (!rows.length && item.name) rows = await findWithNominatim(item.name);
  if (!rows.length) throw new Error('Konum bulunamadı');

  return {
    ...item,
    address: rows[0].address || item.address,
    lat: rows[0].lat,
    lng: rows[0].lng,
  };
}

async function runInstantLocalSearch(query) {
  const trimmed = query.trim();
  latestQuery = trimmed;

  if (trimmed.length < 3) {
    hideBursaResults();
    return;
  }

  if (!poiReady) {
    showBursaMessage('Firma listesi hazırlanıyor…', 'İlk açılışta bir kez yükleniyor.');
    await poiLoadPromise;
    if (trimmed !== latestQuery) return;
  }

  const rows = searchLocalBusinesses(trimmed);
  if (trimmed !== latestQuery) return;

  bursaResults = rows;
  if (rows.length) {
    renderBursaResults(rows, 'hızlı Bursa firma listesi');
  } else if (poiFailed) {
    showBursaMessage('Firma listesi yüklenemedi.', 'Klavyedeki Ara tuşuyla firma veya adresi yine arayabilirsin.');
  } else {
    showBursaMessage('Yerel listede bulamadım.', 'Klavyedeki Ara tuşuna bas; firma/adres aramasını genişletelim.');
  }
}

async function runSubmitSearch(query) {
  const trimmed = query.trim();
  latestQuery = trimmed;
  if (!trimmed) {
    hideBursaResults();
    return;
  }

  if (!poiReady) await poiLoadPromise;

  const localRows = searchLocalBusinesses(trimmed);
  const looksLikeAddress = /\d|,|\bmah\b|\bmahalle\b|\bcad\b|\bcadde\b|\bsok\b|\bsokak\b/i.test(trimmed);
  if (localRows.length && !looksLikeAddress) {
    bursaResults = localRows;
    renderBursaResults(localRows, 'hızlı Bursa firma listesi');
    return;
  }

  showBursaMessage('Bursa’da aranıyor…', 'Firma veya adres sonucu getiriliyor.');

  try {
    const rows = await findWithNominatim(trimmed);
    if (trimmed !== latestQuery) return;
    bursaResults = rows;
    renderBursaResults(rows, 'OpenStreetMap geniş arama');
  } catch (error) {
    if (trimmed === latestQuery) {
      showBursaMessage('Arama yapılamadı.', error?.name === 'AbortError' ? 'Arama zaman aşımına uğradı. Tekrar dene.' : (error?.message || 'Tekrar dene.'));
    }
  }
}

if (bursaForm && bursaInput && bursaResultsBox) {
  bursaInput.addEventListener('input', () => {
    const query = bursaInput.value.trim();
    latestQuery = query;

    if (query.length < 3) {
      hideBursaResults();
      return;
    }

    runInstantLocalSearch(query);
  });

  bursaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const query = bursaInput.value.trim();
    if (!query) {
      hideBursaResults();
      return;
    }

    if (bursaButton) bursaButton.disabled = true;
    try {
      await runSubmitSearch(query);
    } finally {
      if (bursaButton) bursaButton.disabled = false;
      bursaInput.focus();
    }
  }, true);

  bursaResultsBox.addEventListener('click', async (event) => {
    const button = event.target.closest('.search-result');
    if (!button) return;

    const item = bursaResults[Number(button.dataset.index)];
    if (!item) return;

    button.disabled = true;
    const oldText = button.style.opacity;
    button.style.opacity = '0.6';

    try {
      const resolved = await resolvePlacePoint(item);
      await addStop({
        address: resolved.address,
        recipient: resolved.name,
        point: { lat: resolved.lat, lng: resolved.lng },
      });
      rememberPlace(resolved);
      bursaInput.value = '';
      latestQuery = '';
      hideBursaResults();
      showToast(`${resolved.name} eklendi.`);
    } catch {
      button.disabled = false;
      button.style.opacity = oldText;
      showToast('Firmanın konumu bulunamadı.');
    }
  });
}
