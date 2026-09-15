const BURSA_VIEWBOX = '28.0,40.82,30.35,39.18';
const bursaResultsBox = document.getElementById('searchResults');
const bursaForm = document.getElementById('quickAddForm');
const bursaInput = document.getElementById('quickAddressInput');
const bursaButton = document.getElementById('quickAddBtn');
let bursaResults = [];

function isBursaResult(item) {
  const address = item.address || {};
  const text = [
    address.city,
    address.town,
    address.county,
    address.state,
    address.province,
    address.region,
    address['ISO3166-2-lvl4'],
    item.display_name,
  ].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
  return text.includes('bursa') || text.includes('tr-16');
}

function placeName(item) {
  return item.namedetails?.name || item.name || item.display_name?.split(',')[0] || 'Bursa durağı';
}

function shortAddress(item) {
  const a = item.address || {};
  const parts = [a.road, a.house_number, a.neighbourhood || a.suburb || a.quarter, a.town || a.city_district || a.city].filter(Boolean);
  return parts.length ? parts.join(', ') : item.display_name;
}

async function findInBursa(query) {
  const q = query.toLocaleLowerCase('tr-TR').includes('bursa') ? query : `${query}, Bursa`;
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '8',
    countrycodes: 'tr',
    addressdetails: '1',
    namedetails: '1',
    viewbox: BURSA_VIEWBOX,
    bounded: '1',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { 'Accept-Language': 'tr' },
  });
  if (!response.ok) throw new Error('Arama servisine ulaşılamadı.');
  return (await response.json()).filter(isBursaResult).slice(0, 6);
}

function hideBursaResults() {
  bursaResults = [];
  bursaResultsBox.replaceChildren();
  bursaResultsBox.hidden = true;
}

function showBursaMessage(title, detail) {
  bursaResultsBox.replaceChildren();
  bursaResultsBox.hidden = false;
  const box = document.createElement('div');
  box.className = 'search-empty';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = detail;
  box.append(strong, span);
  bursaResultsBox.append(box);
}

function renderBursaResults(rows) {
  bursaResultsBox.replaceChildren();
  bursaResultsBox.hidden = false;
  if (!rows.length) {
    showBursaMessage('Bursa’da bulamadım.', 'Firma adı çıkmıyorsa açık adresi yazıp tekrar ara.');
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
    name.textContent = placeName(item);
    const address = document.createElement('span');
    address.textContent = shortAddress(item);
    main.append(name, address);
    const add = document.createElement('span');
    add.className = 'search-add';
    add.textContent = '+';
    button.append(main, add);
    bursaResultsBox.append(button);
  });
}

if (bursaForm && bursaInput && bursaResultsBox) {
  bursaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const query = bursaInput.value.trim();
    if (!query) {
      hideBursaResults();
      return;
    }
    bursaInput.disabled = true;
    if (bursaButton) {
      bursaButton.disabled = true;
      bursaButton.textContent = '…';
    }
    showBursaMessage('Bursa’da aranıyor…', 'Firma veya adres sonuçları getiriliyor.');
    try {
      bursaResults = await findInBursa(query);
      renderBursaResults(bursaResults);
    } catch (error) {
      showBursaMessage('Arama yapılamadı.', error.message || 'Tekrar dene.');
    } finally {
      bursaInput.disabled = false;
      if (bursaButton) {
        bursaButton.disabled = false;
        bursaButton.textContent = 'Ara';
      }
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
        address: item.display_name,
        recipient: placeName(item),
        point: { lat: Number(item.lat), lng: Number(item.lon) },
      });
      bursaInput.value = '';
      hideBursaResults();
      showToast(`${placeName(item)} eklendi.`);
    } catch {
      button.disabled = false;
      showToast('Durak eklenemedi.');
    }
  });

  bursaInput.addEventListener('input', () => {
    if (!bursaInput.value.trim()) hideBursaResults();
  });
}
