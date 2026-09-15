const STORAGE_KEY = 'kargo-route-v1';
const DEFAULT_CENTER = [40.195, 29.06];

const state = {
  stops: [],
  userLocation: null,
  routeLayer: null,
  markers: [],
  userMarker: null,
  selectingMapPoint: false,
  selectedMapPoint: null,
};

const el = {
  stopCount: document.getElementById('stopCount'),
  distanceValue: document.getElementById('distanceValue'),
  durationValue: document.getElementById('durationValue'),
  mapStatus: document.getElementById('mapStatus'),
  stopList: document.getElementById('stopList'),
  emptyState: document.getElementById('emptyState'),
  addStopBtn: document.getElementById('addStopBtn'),
  optimizeBtn: document.getElementById('optimizeBtn'),
  startRouteBtn: document.getElementById('startRouteBtn'),
  locateBtn: document.getElementById('locateBtn'),
  clearDoneBtn: document.getElementById('clearDoneBtn'),
  stopDialog: document.getElementById('stopDialog'),
  stopForm: document.getElementById('stopForm'),
  closeDialogBtn: document.getElementById('closeDialogBtn'),
  addressInput: document.getElementById('addressInput'),
  recipientInput: document.getElementById('recipientInput'),
  phoneInput: document.getElementById('phoneInput'),
  noteInput: document.getElementById('noteInput'),
  formMessage: document.getElementById('formMessage'),
  saveStopBtn: document.getElementById('saveStopBtn'),
  useMapPointBtn: document.getElementById('useMapPointBtn'),
  toast: document.getElementById('toast'),
};

const map = L.map('map', {
  zoomControl: true,
  attributionControl: true,
}).setView(DEFAULT_CENTER, 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap',
}).addTo(map);

loadState();
render();
restoreMapBounds();

map.on('click', (event) => {
  if (!state.selectingMapPoint) return;
  state.selectedMapPoint = {
    lat: event.latlng.lat,
    lng: event.latlng.lng,
  };
  state.selectingMapPoint = false;
  el.mapStatus.textContent = 'Nokta seçildi. Adresi kaydetmek için formu tamamla.';
  openStopDialog();
  el.formMessage.textContent = 'Haritadaki seçili konum kullanılacak.';
});

el.addStopBtn.addEventListener('click', () => {
  state.selectedMapPoint = null;
  resetStopForm();
  openStopDialog();
});

el.closeDialogBtn.addEventListener('click', closeStopDialog);
el.stopDialog.addEventListener('click', (event) => {
  if (event.target === el.stopDialog) closeStopDialog();
});

el.useMapPointBtn.addEventListener('click', () => {
  closeStopDialog();
  state.selectingMapPoint = true;
  el.mapStatus.textContent = 'Haritada teslimat noktasına dokun.';
  showToast('Haritadan bir nokta seç.');
});

el.stopForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = el.addressInput.value.trim();
  if (!address) return;

  setFormBusy(true, 'Adres hazırlanıyor…');
  try {
    let point = state.selectedMapPoint;
    let resolvedAddress = address;

    if (!point) {
      el.formMessage.textContent = 'Adres haritada aranıyor…';
      const geocoded = await geocodeAddress(address);
      point = { lat: geocoded.lat, lng: geocoded.lng };
      resolvedAddress = geocoded.displayName || address;
    }

    const stop = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      address: resolvedAddress,
      recipient: el.recipientInput.value.trim(),
      phone: el.phoneInput.value.trim(),
      note: el.noteInput.value.trim(),
      lat: point.lat,
      lng: point.lng,
      status: 'pending',
      createdAt: Date.now(),
    };

    state.stops.push(stop);
    state.selectedMapPoint = null;
    saveState();
    closeStopDialog();
    resetStopForm();
    render();
    fitStops();
    await drawRoute();
    showToast('Durak eklendi.');
  } catch (error) {
    el.formMessage.textContent = error.message || 'Adres bulunamadı.';
  } finally {
    setFormBusy(false);
  }
});

el.locateBtn.addEventListener('click', locateUser);
el.optimizeBtn.addEventListener('click', async () => {
  optimizeStops();
  saveState();
  render();
  await drawRoute();
  fitStops();
  showToast('Duraklar en yakından uzağa sıralandı.');
});

el.startRouteBtn.addEventListener('click', () => {
  const next = state.stops.find((stop) => stop.status === 'pending');
  if (!next) {
    showToast('Bekleyen teslimat kalmadı.');
    return;
  }
  const destination = `${next.lat},${next.lng}`;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const url = isIOS
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  window.open(url, '_blank', 'noopener,noreferrer');
});

el.clearDoneBtn.addEventListener('click', async () => {
  const before = state.stops.length;
  state.stops = state.stops.filter((stop) => stop.status === 'pending');
  if (before === state.stops.length) {
    showToast('Temizlenecek tamamlanmış durak yok.');
    return;
  }
  saveState();
  render();
  await drawRoute();
  fitStops();
  showToast('Tamamlanan duraklar temizlendi.');
});

async function geocodeAddress(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'tr',
    addressdetails: '1',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { 'Accept-Language': 'tr' },
  });
  if (!response.ok) throw new Error('Adres servisine ulaşılamadı.');
  const results = await response.json();
  if (!results.length) throw new Error('Bu adresi bulamadım. İlçe ve şehir ekleyip tekrar dene.');
  return {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    displayName: results[0].display_name,
  };
}

function locateUser() {
  if (!navigator.geolocation) {
    showToast('Bu cihaz konum özelliğini desteklemiyor.');
    return;
  }
  el.mapStatus.textContent = 'Konum alınıyor…';
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      state.userLocation = { lat: coords.latitude, lng: coords.longitude };
      renderUserMarker();
      map.setView([coords.latitude, coords.longitude], 14);
      el.mapStatus.textContent = 'Başlangıç konumun hazır.';
      await drawRoute();
      showToast('Konum güncellendi.');
    },
    () => {
      el.mapStatus.textContent = 'Konum izni verilmedi. Rota yine oluşturulabilir.';
      showToast('Konum alınamadı.');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

function optimizeStops() {
  const pending = state.stops.filter((stop) => stop.status === 'pending');
  const completed = state.stops.filter((stop) => stop.status !== 'pending');
  if (pending.length < 2) return;

  let cursor = state.userLocation
    ? { lat: state.userLocation.lat, lng: state.userLocation.lng }
    : { lat: pending[0].lat, lng: pending[0].lng };

  const remaining = [...pending];
  const ordered = [];
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((stop, index) => {
      const distance = haversine(cursor.lat, cursor.lng, stop.lat, stop.lng);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    cursor = { lat: next.lat, lng: next.lng };
  }
  state.stops = [...ordered, ...completed];
}

async function drawRoute() {
  if (state.routeLayer) {
    map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }

  const pending = state.stops.filter((stop) => stop.status === 'pending');
  if (!pending.length) {
    updateRouteMetrics(0, 0);
    el.mapStatus.textContent = state.stops.length ? 'Bugünkü teslimatlar tamamlandı.' : 'Durak ekleyerek rotanı oluştur.';
    return;
  }

  const points = [];
  if (state.userLocation) points.push([state.userLocation.lng, state.userLocation.lat]);
  pending.forEach((stop) => points.push([stop.lng, stop.lat]));

  if (points.length < 2) {
    updateRouteMetrics(0, 0);
    el.mapStatus.textContent = 'Bir durak daha ekle veya başlangıç konumunu al.';
    return;
  }

  try {
    const coords = points.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`);
    if (!response.ok) throw new Error('route');
    const data = await response.json();
    if (!data.routes?.length) throw new Error('route');

    const route = data.routes[0];
    state.routeLayer = L.geoJSON(route.geometry, {
      style: { color: '#181915', weight: 5, opacity: 0.82, lineCap: 'round', lineJoin: 'round' },
    }).addTo(map);
    updateRouteMetrics(route.distance, route.duration);
    el.mapStatus.textContent = `${pending.length} bekleyen teslimat · rota hazır`;
  } catch {
    const fallback = estimateStraightLineRoute(points);
    updateRouteMetrics(fallback.distance, fallback.duration);
    el.mapStatus.textContent = 'Yol rotası alınamadı; yaklaşık mesafe gösteriliyor.';
  }
}

function estimateStraightLineRoute(points) {
  let km = 0;
  for (let i = 1; i < points.length; i += 1) {
    km += haversine(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  }
  const roadKm = km * 1.28;
  return { distance: roadKm * 1000, duration: (roadKm / 32) * 3600 };
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function render() {
  renderList();
  renderMarkers();
  renderUserMarker();
  const pending = state.stops.filter((stop) => stop.status === 'pending').length;
  el.stopCount.textContent = String(state.stops.length);
  el.emptyState.hidden = state.stops.length > 0;
  el.optimizeBtn.disabled = pending < 2;
  el.startRouteBtn.disabled = pending < 1;
}

function renderList() {
  el.stopList.replaceChildren();
  state.stops.forEach((stop, index) => {
    const li = document.createElement('li');
    li.className = `stop-card ${stop.status === 'done' ? 'done' : ''}`;

    const row = document.createElement('div');
    row.className = 'stop-row';

    const number = document.createElement('div');
    number.className = 'stop-index';
    number.textContent = stop.status === 'done' ? '✓' : stop.status === 'failed' ? '!' : String(index + 1);

    const main = document.createElement('div');
    main.className = 'stop-main';

    const recipient = document.createElement('div');
    recipient.className = 'stop-recipient';
    recipient.textContent = stop.recipient || `Durak ${index + 1}`;

    const address = document.createElement('div');
    address.className = 'stop-address';
    address.textContent = stop.address;

    main.append(recipient, address);
    if (stop.note) {
      const note = document.createElement('div');
      note.className = 'stop-note';
      note.textContent = stop.note;
      main.append(note);
    }
    row.append(number, main);
    li.append(row);

    const actions = document.createElement('div');
    actions.className = 'stop-actions';

    if (stop.status === 'pending') {
      actions.append(
        actionButton('Navigasyon', () => openNavigation(stop)),
        actionButton('✓ Teslim edildi', () => setStopStatus(stop.id, 'done'), 'success'),
        actionButton('Edilemedi', () => setStopStatus(stop.id, 'failed')),
      );
    } else {
      actions.append(actionButton('Geri al', () => setStopStatus(stop.id, 'pending')));
    }

    if (stop.phone) {
      actions.append(actionButton('Ara', () => { window.location.href = `tel:${stop.phone.replace(/[^+\d]/g, '')}`; }));
    }
    actions.append(actionButton('Sil', () => deleteStop(stop.id), 'danger'));
    li.append(actions);
    el.stopList.append(li);
  });
}

function actionButton(label, handler, variant = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `pill-button ${variant}`.trim();
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderMarkers() {
  state.markers.forEach((marker) => map.removeLayer(marker));
  state.markers = [];

  state.stops.forEach((stop, index) => {
    const doneClass = stop.status === 'done' ? ' done' : '';
    const label = stop.status === 'done' ? '✓' : stop.status === 'failed' ? '!' : String(index + 1);
    const icon = L.divIcon({
      className: '',
      html: `<div class="marker-dot${doneClass}">${label}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    const marker = L.marker([stop.lat, stop.lng], { icon })
      .addTo(map)
      .bindTooltip(stop.recipient || stop.address, { direction: 'top', offset: [0, -14] });
    state.markers.push(marker);
  });
}

function renderUserMarker() {
  if (state.userMarker) {
    map.removeLayer(state.userMarker);
    state.userMarker = null;
  }
  if (!state.userLocation) return;
  const icon = L.divIcon({
    className: '',
    html: '<div class="marker-start">⌖</div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
  state.userMarker = L.marker([state.userLocation.lat, state.userLocation.lng], { icon })
    .addTo(map)
    .bindTooltip('Başlangıç konumu', { direction: 'top', offset: [0, -14] });
}

async function setStopStatus(id, status) {
  const stop = state.stops.find((item) => item.id === id);
  if (!stop) return;
  stop.status = status;
  saveState();
  render();
  await drawRoute();
  showToast(status === 'done' ? 'Teslimat tamamlandı.' : status === 'failed' ? 'Teslim edilemedi olarak işaretlendi.' : 'Durak tekrar beklemeye alındı.');
}

async function deleteStop(id) {
  state.stops = state.stops.filter((stop) => stop.id !== id);
  saveState();
  render();
  await drawRoute();
  fitStops();
  showToast('Durak silindi.');
}

function openNavigation(stop) {
  const destination = `${stop.lat},${stop.lng}`;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const url = isIOS
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function fitStops() {
  const points = state.stops.map((stop) => [stop.lat, stop.lng]);
  if (state.userLocation) points.push([state.userLocation.lat, state.userLocation.lng]);
  if (!points.length) return;
  if (points.length === 1) map.setView(points[0], 14);
  else map.fitBounds(points, { padding: [38, 38], maxZoom: 15 });
}

function restoreMapBounds() {
  setTimeout(async () => {
    fitStops();
    await drawRoute();
  }, 80);
}

function updateRouteMetrics(distanceMeters, durationSeconds) {
  if (!distanceMeters) {
    el.distanceValue.textContent = '—';
    el.durationValue.textContent = '—';
    return;
  }
  const km = distanceMeters / 1000;
  el.distanceValue.textContent = km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  el.durationValue.textContent = minutes >= 60
    ? `${Math.floor(minutes / 60)}s ${minutes % 60}dk`
    : `${minutes} dk`;
}

function openStopDialog() {
  if (!el.stopDialog.open) el.stopDialog.showModal();
  setTimeout(() => el.addressInput.focus(), 100);
}

function closeStopDialog() {
  if (el.stopDialog.open) el.stopDialog.close();
}

function resetStopForm() {
  el.stopForm.reset();
  el.formMessage.textContent = '';
  state.selectedMapPoint = null;
}

function setFormBusy(busy, message = '') {
  el.saveStopBtn.disabled = busy;
  el.useMapPointBtn.disabled = busy;
  el.saveStopBtn.textContent = busy ? 'Ekleniyor…' : 'Adresi bul ve ekle';
  if (message) el.formMessage.textContent = message;
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.add('show');
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ stops: state.stops }));
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (Array.isArray(parsed.stops)) state.stops = parsed.stops;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
