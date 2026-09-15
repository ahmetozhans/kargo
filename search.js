const BURSA_BBOX = '28.0,39.18,30.35,40.82';
const BURSA_CENTER = { lat: 40.195, lon: 29.06 };
const BURSA_TERMS = [
  'bursa', 'osmangazi', 'nilüfer', 'nilufer', 'yıldırım', 'yildirim', 'inegöl', 'inegol',
  'mudanya', 'gemlik', 'gürsu', 'gursu', 'kestel', 'karacabey', 'mustafakemalpaşa',
  'mustafakemalpasa', 'orhangazi', 'iznik', 'yenişehir', 'yenisehir', 'keles', 'orhaneli',
  'büyükorhan', 'buyukorhan', 'harmancık', 'harmancik'
];

const bursaResultsBox = document.getElementById('searchResults');
const bursaForm = document.getElementById('quickAddForm');
const bursaInput = document.getElementById('quickAddressInput');
const bursaButton = document.getElementById('quickAddBtn');

let bursaResults = [];
let searchTimer = 0;
let activeController = null;
let latestQuery = '';

function normalizeText(value = '') {
  return String(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function looksLikeBursa(properties = {}) {
  const text = normalizeText([
    properties.state,
    properties.county,
    properties.city,
    properties.district,
    properties.locality,
    properties.name,
    properties.street,
  ].filter(Boolean).join(' '));

  return BURSA_TERMS.some((term) => text.includes(normalizeText(term)));
}

function photonName(feature) {
  const p = feature?.properties || {};
  return p.name || p.street || p.city || p.county || 'Bursa durağı';
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

function photonAddress(feature) {
  const p = feature?.properties || {};
  const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ');
  const parts = uniqueParts([
    streetLine,
    p.district,
    p.locality,
    p.city,
    p.county,
    p.state,
    'Bursa',
  ]);
  return parts.join(', ') || photonName(feature);
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

function renderBursaResults(rows) {
  if (!bursaResultsBox) return;
  bursaResultsBox.replaceChildren();
  bursaResultsBox.hidden = false;

  if (!rows.length) {
    showBursaMessage('Bursa’da bulamadım.', 'Firma adı çıkmıyorsa açık adresi yazıp tekrar dene.');
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
  source.textContent = 'Arama: OpenStreetMap / Photon';
  source.style.padding = '6px 8px 4px';
  source.style.fontSize = '9px';
  source.style.color = '#98a3b7';
  source.style.textAlign = 'right';
  bursaResultsBox.append(source);
}

async function findWithPhoton(query, signal) {
  const params = new URLSearchParams({
    q: query,
    bbox: BURSA_BBOX,
    lat: String(BURSA_CENTER.lat),
    lon: String(BURSA_CENTER.lon),
    limit: '10',
    lang: 'tr',
    countrycode: 'TR',
  });

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Canlı arama servisine ulaşılamadı.');

  const data = await response.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  return features
    .filter((feature) => {
      const coords = feature?.geometry?.coordinates || [];
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      const inBox = lon >= 28.0 && lon <= 30.35 && lat >= 39.18 && lat <= 40.82;
      return inBox && looksLikeBursa(feature.properties || {});
    })
    .slice(0, 6)
    .map((feature) => {
      const coords = feature.geometry.coordinates;
      return {
        provider: 'photon',
        name: photonName(feature),
        address: photonAddress(feature),
        lat: Number(coords[1]),
        lng: Number(coords[0]),
      };
    });
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

async function runLiveSearch(query, { fallback = false } = {}) {
  const trimmed = query.trim();
  latestQuery = trimmed;

  if (trimmed.length < 3) {
    hideBursaResults();
    return;
  }

  activeController?.abort();
  activeController = new AbortController();
  const controller = activeController;

  showBursaMessage('Bursa’da aranıyor…', 'Firma ve adres sonuçları getiriliyor.');

  try {
    let rows = await findWithPhoton(trimmed, controller.signal);
    if (fallback && !rows.length) rows = await findWithNominatim(trimmed);
    if (trimmed !== latestQuery) return;
    bursaResults = rows;
    renderBursaResults(rows);
  } catch (error) {
    if (error?.name === 'AbortError') return;

    if (fallback) {
      try {
        const rows = await findWithNominatim(trimmed);
        if (trimmed !== latestQuery) return;
        bursaResults = rows;
        renderBursaResults(rows);
        return;
      } catch {}
    }

    if (trimmed === latestQuery) {
      showBursaMessage('Canlı arama şu an cevap vermedi.', 'Klavyedeki Ara tuşuna basıp tekrar deneyebilirsin.');
    }
  }
}

if (bursaForm && bursaInput && bursaResultsBox) {
  bursaInput.addEventListener('input', () => {
    const query = bursaInput.value.trim();
    latestQuery = query;
    clearTimeout(searchTimer);

    if (query.length < 3) {
      activeController?.abort();
      hideBursaResults();
      return;
    }

    searchTimer = window.setTimeout(() => runLiveSearch(query), 320);
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
      await runLiveSearch(query, { fallback: true });
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
      activeController?.abort();
      hideBursaResults();
      showToast(`${item.name} eklendi.`);
    } catch {
      button.disabled = false;
      showToast('Durak eklenemedi.');
    }
  });
}
