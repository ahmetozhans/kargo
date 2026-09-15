const BURSA_BBOX = { south: 39.18, west: 28.0, north: 40.82, east: 30.35 };
const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const bursaResultsBox = document.getElementById('searchResults');
const bursaForm = document.getElementById('quickAddForm');
const bursaInput = document.getElementById('quickAddressInput');
const bursaButton = document.getElementById('quickAddBtn');

let bursaResults = [];
let searchTimer = 0;
let latestQuery = '';
let liveSearchSeq = 0;
const searchCache = new Map();

function normalizeText(value = '') {
  return String(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    if (!part) return false;
    const key = normalizeText(part);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeOverpassRegex(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function renderBursaResults(rows, sourceLabel = 'OpenStreetMap') {
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

function overpassAddress(tags = {}) {
  const streetLine = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const parts = uniqueParts([
    streetLine,
    tags['addr:neighbourhood'] || tags['addr:suburb'] || tags['addr:quarter'],
    tags['addr:district'],
    tags['addr:city'],
    tags['addr:postcode'],
    'Bursa',
  ]);
  return parts.join(', ') || 'Bursa';
}

function parseOverpassElements(data) {
  const rows = [];
  const seen = new Set();

  for (const element of data?.elements || []) {
    const tags = element.tags || {};
    const name = tags.name || tags.brand || tags.operator;
    if (!name) continue;

    const lat = Number(element.lat ?? element.center?.lat);
    const lng = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lng < BURSA_BBOX.west || lng > BURSA_BBOX.east || lat < BURSA_BBOX.south || lat > BURSA_BBOX.north) continue;

    const key = `${normalizeText(name)}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      provider: 'overpass',
      name,
      address: overpassAddress(tags),
      lat,
      lng,
    });

    if (rows.length >= 8) break;
  }

  return rows;
}

async function findBusinessesWithOverpass(query) {
  const cacheKey = normalizeText(query);
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);

  const escaped = escapeOverpassRegex(query.trim());
  const bbox = `${BURSA_BBOX.south},${BURSA_BBOX.west},${BURSA_BBOX.north},${BURSA_BBOX.east}`;
  const ql = `[out:json][timeout:8];(
    nwr["name"~"${escaped}",i]["shop"](${bbox});
    nwr["name"~"${escaped}",i]["office"](${bbox});
    nwr["name"~"${escaped}",i]["amenity"](${bbox});
    nwr["name"~"${escaped}",i]["craft"](${bbox});
    nwr["name"~"${escaped}",i]["tourism"](${bbox});
    nwr["name"~"${escaped}",i]["leisure"](${bbox});
    nwr["name"~"${escaped}",i]["healthcare"](${bbox});
    nwr["name"~"${escaped}",i]["industrial"](${bbox});
  );out center tags 12;`;

  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(ql)}`,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const data = await response.json();
      const rows = parseOverpassElements(data);
      searchCache.set(cacheKey, rows);
      return rows;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Canlı firma araması yapılamadı.');
}

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

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { 'Accept-Language': 'tr' },
  });
  if (!response.ok) throw new Error('Adres araması yapılamadı.');

  const rows = await response.json();
  return rows
    .filter((item) => normalizeText(item.display_name || '').includes('bursa'))
    .slice(0, 6)
    .map((item) => ({
      provider: 'nominatim',
      name: item.namedetails?.name || item.name || item.display_name?.split(',')[0] || 'Bursa durağı',
      address: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
    }));
}

async function runLiveSearch(query) {
  const trimmed = query.trim();
  latestQuery = trimmed;

  if (trimmed.length < 3) {
    hideBursaResults();
    return;
  }

  const seq = ++liveSearchSeq;
  showBursaMessage('Bursa’da aranıyor…', 'Firma ve işletmeler aranıyor.');

  try {
    const rows = await findBusinessesWithOverpass(trimmed);
    if (seq !== liveSearchSeq || trimmed !== latestQuery) return;
    bursaResults = rows;
    renderBursaResults(rows, 'OpenStreetMap işletmeleri');
  } catch {
    if (seq !== liveSearchSeq || trimmed !== latestQuery) return;
    showBursaMessage('Canlı firma araması şu an cevap vermedi.', 'Açık adres yazıp klavyedeki Ara tuşuna basabilirsin.');
  }
}

async function runSubmitSearch(query) {
  const trimmed = query.trim();
  latestQuery = trimmed;
  if (!trimmed) {
    hideBursaResults();
    return;
  }

  ++liveSearchSeq;
  showBursaMessage('Bursa’da aranıyor…', 'Firma veya adres sonucu getiriliyor.');

  try {
    let rows = [];
    try {
      rows = await findBusinessesWithOverpass(trimmed);
    } catch {}

    if (!rows.length) rows = await findWithNominatim(trimmed);
    if (trimmed !== latestQuery) return;

    bursaResults = rows;
    renderBursaResults(rows, rows[0]?.provider === 'overpass' ? 'OpenStreetMap işletmeleri' : 'OpenStreetMap adres');
  } catch (error) {
    if (trimmed === latestQuery) {
      showBursaMessage('Arama yapılamadı.', error?.message || 'Tekrar dene.');
    }
  }
}

if (bursaForm && bursaInput && bursaResultsBox) {
  bursaInput.addEventListener('input', () => {
    const query = bursaInput.value.trim();
    latestQuery = query;
    clearTimeout(searchTimer);

    if (query.length < 3) {
      ++liveSearchSeq;
      hideBursaResults();
      return;
    }

    searchTimer = window.setTimeout(() => runLiveSearch(query), 650);
  });

  bursaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const query = bursaInput.value.trim();
    clearTimeout(searchTimer);
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
    try {
      await addStop({
        address: item.address,
        recipient: item.name,
        point: { lat: item.lat, lng: item.lng },
      });
      bursaInput.value = '';
      latestQuery = '';
      ++liveSearchSeq;
      hideBursaResults();
      showToast(`${item.name} eklendi.`);
    } catch {
      button.disabled = false;
      showToast('Durak eklenemedi.');
    }
  });
}
