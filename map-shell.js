const routeSheetEl = document.getElementById('routeSheet');
const sheetHandleEl = document.getElementById('sheetHandle');
const sheetScrollEl = document.getElementById('sheetScroll');
const miniMenuEl = document.getElementById('miniMenu');
const menuBtnEl = document.getElementById('menuBtn');
const layerBtnEl = document.getElementById('layerBtn');
const copyRouteBtnEl = document.getElementById('copyRouteBtn');
const shellSearchInput = document.getElementById('quickAddressInput');
const shellStopList = document.getElementById('stopList');
const shellEmptyState = document.getElementById('emptyState');

const LAST_ROUTE_KEY = 'kargo-last-route-v1';
const ROUTE_STORAGE_KEY = 'kargo-route-v1';
let sheetLevel = 'mid';
let dragStartY = 0;
let dragStartHeight = 0;
let draggingSheet = false;
let altLayer = null;
let usingAltLayer = false;

function setSheetLevel(level) {
  sheetLevel = level;
  routeSheetEl.classList.remove('sheet-low', 'sheet-mid', 'sheet-high', 'dragging');
  routeSheetEl.style.height = '';
  routeSheetEl.classList.add(`sheet-${level}`);
  document.body.classList.toggle('sheet-is-low', level === 'low');
  document.body.classList.toggle('sheet-is-high', level === 'high');
}

function cycleSheet() {
  if (sheetLevel === 'low') setSheetLevel('mid');
  else if (sheetLevel === 'mid') setSheetLevel('high');
  else setSheetLevel('low');
}

sheetHandleEl?.addEventListener('click', cycleSheet);

sheetHandleEl?.addEventListener('pointerdown', (event) => {
  if (window.matchMedia('(min-width: 800px)').matches) return;
  draggingSheet = true;
  dragStartY = event.clientY;
  dragStartHeight = routeSheetEl.getBoundingClientRect().height;
  routeSheetEl.classList.add('dragging');
  sheetHandleEl.setPointerCapture?.(event.pointerId);
});

sheetHandleEl?.addEventListener('pointermove', (event) => {
  if (!draggingSheet) return;
  const delta = dragStartY - event.clientY;
  const minHeight = window.innerHeight * .28;
  const maxHeight = window.innerHeight * .84;
  const nextHeight = Math.min(maxHeight, Math.max(minHeight, dragStartHeight + delta));
  routeSheetEl.style.height = `${nextHeight}px`;
});

function finishSheetDrag() {
  if (!draggingSheet) return;
  draggingSheet = false;
  const ratio = routeSheetEl.getBoundingClientRect().height / window.innerHeight;
  if (ratio > .70) setSheetLevel('high');
  else if (ratio < .39) setSheetLevel('low');
  else setSheetLevel('mid');
}

sheetHandleEl?.addEventListener('pointerup', finishSheetDrag);
sheetHandleEl?.addEventListener('pointercancel', finishSheetDrag);

shellSearchInput?.addEventListener('focus', () => {
  if (!window.matchMedia('(min-width: 800px)').matches) setSheetLevel('high');
});

menuBtnEl?.addEventListener('click', () => {
  miniMenuEl.hidden = !miniMenuEl.hidden;
});

document.addEventListener('click', (event) => {
  if (!miniMenuEl || miniMenuEl.hidden) return;
  if (miniMenuEl.contains(event.target) || menuBtnEl.contains(event.target)) return;
  miniMenuEl.hidden = true;
});

document.getElementById('menuLocateBtn')?.addEventListener('click', () => {
  document.getElementById('locateBtn')?.click();
  miniMenuEl.hidden = true;
});

document.getElementById('menuOptimizeBtn')?.addEventListener('click', () => {
  const button = document.getElementById('optimizeBtn');
  if (!button?.disabled) button.click();
  else showToast('Sıralamak için en az 2 durak ekle.');
  miniMenuEl.hidden = true;
});

document.getElementById('menuClearBtn')?.addEventListener('click', () => {
  document.getElementById('clearDoneBtn')?.click();
  miniMenuEl.hidden = true;
});

layerBtnEl?.addEventListener('click', () => {
  try {
    const tileLayers = [];
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) tileLayers.push(layer);
    });
    tileLayers.forEach((layer) => map.removeLayer(layer));

    if (!usingAltLayer) {
      altLayer = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors, Tiles style by HOT',
      }).addTo(map);
      usingAltLayer = true;
      layerBtnEl.textContent = '▱';
      showToast('Harita görünümü değiştirildi.');
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      usingAltLayer = false;
      layerBtnEl.textContent = '◇';
      showToast('Standart haritaya dönüldü.');
    }
  } catch {
    showToast('Harita görünümü değiştirilemedi.');
  }
});

function syncShellState() {
  const pendingCards = shellStopList?.querySelectorAll('.stop-card.pending').length || 0;
  const allCards = shellStopList?.querySelectorAll('.stop-card').length || 0;
  const hasStops = allCards > 0;
  document.body.classList.toggle('has-stops', hasStops);

  if (hasStops && sheetLevel === 'low') setSheetLevel('mid');
  if (!hasStops && sheetLevel === 'high' && document.activeElement !== shellSearchInput) setSheetLevel('mid');

  if (allCards > 0 && pendingCards === 0) saveFinishedRouteSnapshot();
}

function saveFinishedRouteSnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTE_STORAGE_KEY) || '{}');
    if (!Array.isArray(parsed.stops) || !parsed.stops.length) return;
    const signature = parsed.stops.map((stop) => `${stop.address}|${stop.lat}|${stop.lng}`).join('~');
    const existing = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY) || '{}');
    if (existing.signature === signature) return;
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({
      signature,
      savedAt: Date.now(),
      stops: parsed.stops.map((stop) => ({
        address: stop.address,
        recipient: stop.recipient || '',
        phone: stop.phone || '',
        note: stop.note || '',
        lat: stop.lat,
        lng: stop.lng,
      })),
    }));
  } catch {
    // Yerel kayıt hatası dağıtım akışını etkilemesin.
  }
}

copyRouteBtnEl?.addEventListener('click', () => {
  try {
    const previous = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY) || '{}');
    if (!Array.isArray(previous.stops) || !previous.stops.length) {
      showToast('Henüz kaydedilmiş eski rota yok.');
      return;
    }
    const current = JSON.parse(localStorage.getItem(ROUTE_STORAGE_KEY) || '{}');
    const currentStops = Array.isArray(current.stops) ? current.stops : [];
    if (currentStops.some((stop) => stop.status === 'pending')) {
      showToast('Önce mevcut rotayı bitir veya temizle.');
      return;
    }
    const now = Date.now();
    const cloned = previous.stops.map((stop, index) => ({
      ...stop,
      id: crypto.randomUUID ? crypto.randomUUID() : `${now}-${index}`,
      status: 'pending',
      createdAt: now + index,
    }));
    localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify({ stops: cloned }));
    location.reload();
  } catch {
    showToast('Eski rota kopyalanamadı.');
  }
});

if (shellStopList) {
  const shellObserver = new MutationObserver(syncShellState);
  shellObserver.observe(shellStopList, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

window.addEventListener('resize', () => {
  if (window.matchMedia('(min-width: 800px)').matches) {
    document.body.classList.remove('sheet-is-low', 'sheet-is-high');
  }
});

syncShellState();
