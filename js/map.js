/* Map Module — Leaflet + zones + fish + community + forecast + search */
let map, zoneCluster, reportLayer, kkpLayer;
let allZoneMarkers = [];
let reportMode = false;
let fishMovementActive = false;
let fishMoveInterval = null;
let fishSpeed = 3;
let movingFishMarkers = [];
let lastForecastLatLng = null;
let currentBasemap = null;

function initMap() {
  map = L.map('map', { worldCopyJump: true, preferCanvas: true }).setView([-2, 118], 5);

  const tileEsri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri' });
  const tileDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{y}{r}.png');
  tileEsri.addTo(map);
  currentBasemap = tileEsri;

  zoneCluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
  map.addLayer(zoneCluster);
  reportLayer = L.layerGroup().addTo(map);

  loadKKPZones();
  generateZones();
  initSupabase().then(() => loadCommunityReports(map));

  map.on('click', onMapClick);
  bindMapControls();
}

async function loadKKPZones() {
  try {
    const res = await fetch('data/kkp-zones.geojson');
    if (!res.ok) throw new Error('not found');
    const geojson = await res.json();
    kkpLayer = L.geoJSON(geojson, {
      style: () => ({ color: '#0066cc', fillColor: '#4da6ff', fillOpacity: .25, weight: 2 }),
      onEachFeature: (f, layer) => {
        const props = f.properties || {};
        layer.bindPopup(`<b>${props.NAMA_KK || props.name || 'Kawasan Konservasi'}</b><br>
          <small>Sumber: KKP/BIG</small><br>
          <small>⚠️ Bukan pengganti info resmi KKP</small>`);
      }
    }).addTo(map);
    showToast(t('alert_kkp_loaded'), 'success');
  } catch (e) {
    console.warn('KKP tidak tersedia:', e);
    showToast(t('alert_kkp_failed'), 'warning');
  }
}

function generateZones() {
  zoneCluster.clearLayers();
  allZoneMarkers = [];

  coastalRegions.forEach(region => {
    for (let i = 0; i < 8; i++) {
      const lat = region.latMin + Math.random() * (region.latMax - region.latMin);
      const lng = region.lngMin + Math.random() * (region.lngMax - region.lngMin);
      const roll = Math.random();
      const zone = roll < 0.6 ? zoneDefs[0] : roll < 0.85 ? zoneDefs[1] : zoneDefs[2];
      const marker = L.circleMarker([lat, lng], {
        radius: 12,
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: .55,
        weight: 2,
        zoneKey: zone.key
      }).bindPopup(
        `<b>${zone.label} (SIMULASI)</b><br>
        <small>⚠️ Zona simulasi edukasi, bukan data resmi.</small><br>
        <small>Klik peta untuk forecast laut real.</small>`
      );
      marker.on('click', () => updateMapForecastPanel(lat, lng));
      allZoneMarkers.push(marker);
      zoneCluster.addLayer(marker);
    }
  });
  applyZoneFilters();
}

function applyZoneFilters() {
  const showGreen = document.getElementById('show-green').checked;
  const showYellow = document.getElementById('show-yellow').checked;
  const showRed = document.getElementById('show-red').checked;
  zoneCluster.clearLayers();
  allZoneMarkers.forEach(m => {
    const zk = m.options.zoneKey;
    if ((zk === 'green' && showGreen) || (zk === 'yellow' && showYellow) || (zk === 'red' && showRed)) {
      zoneCluster.addLayer(m);
    }
  });
}

function bindMapControls() {
  document.getElementById('show-green').addEventListener('change', applyZoneFilters);
  document.getElementById('show-yellow').addEventListener('change', applyZoneFilters);
  document.getElementById('show-red').addEventListener('change', applyZoneFilters);

  document.getElementById('btn-gen').addEventListener('click', () => { generateZones(); showToast('Zona digenerate ulang', 'success'); });
  document.getElementById('btn-regen').addEventListener('click', () => { generateZones(); showToast('Zona diregenerasi', 'success'); });
  document.getElementById('btn-random-toggle').addEventListener('click', toggleRandom);
  document.getElementById('toggle-random').addEventListener('click', toggleRandom);

  document.getElementById('btn-load-kkp').addEventListener('click', loadKKPZones);

  document.getElementById('btn-search').addEventListener('click', searchLocation);
  document.getElementById('loc-input').addEventListener('keypress', e => { if (e.key === 'Enter') searchLocation(); });
  document.getElementById('btn-home').addEventListener('click', () => map.setView([-2, 118], 5));

  document.getElementById('btn-clear-reports').addEventListener('click', clearReports);
  document.getElementById('btn-export-fav').addEventListener('click', exportFavorites);

  document.getElementById('btn-toggle-all').addEventListener('click', toggleAllFeatures);

  document.getElementById('btn-refresh-forecast').addEventListener('click', () => {
    if (lastForecastLatLng) updateMapForecastPanel(lastForecastLatLng.lat, lastForecastLatLng.lng);
    else showToast('Klik peta dulu untuk memilih lokasi', 'warning');
  });

  // Fish movement
  document.getElementById('btn-toggle-fish-movement').addEventListener('click', toggleFishMovement);
  document.getElementById('fish-speed-slider').addEventListener('input', e => {
    fishSpeed = parseInt(e.target.value);
    document.getElementById('fish-speed-value').textContent = fishSpeed + 'x';
    if (fishMovementActive) { clearInterval(fishMoveInterval); startFishMoveInterval(); }
  });

  // SOS
  document.getElementById('btn-sos').addEventListener('click', () => sendSOS(EMERGENCY_PHONE));

  // Keyboard: R for report mode
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'r' && !['INPUT','TEXTAREA'].includes(e.target.tagName)) {
      reportMode = !reportMode;
      document.body.style.cursor = reportMode ? 'crosshair' : '';
      showToast(reportMode ? t('alert_report_mode_on') : t('alert_canceled'), reportMode ? 'info' : 'warning');
    }
  });
}

function toggleRandom() {
  randomizeOn = !randomizeOn;
  document.getElementById('toggle-random').textContent = randomizeOn ? t('random_on') : t('random_off');
  if (randomizeOn) {
    randomizeInterval = setInterval(() => generateZones(), 30000);
  } else {
    clearInterval(randomizeInterval);
    randomizeInterval = null;
  }
}

function toggleAllFeatures() {
  const els = document.querySelectorAll('.map-ui-element');
  const hidden = els[0].classList.contains('hidden');
  els.forEach(el => el.classList.toggle('hidden', !hidden));
}

function onMapClick(e) {
  const { lat, lng } = e.latlng;
  lastForecastLatLng = { lat, lng };
  if (reportMode) {
    const species = prompt(t('prompt_species'));
    if (!species) { showToast(t('alert_canceled'), 'warning'); return; }
    const weight = prompt(t('prompt_weight'));
    submitCommunityReport({ lat, lng, species, weight: weight ? parseFloat(weight) : null, note: '' });
    L.marker([lat, lng], {
      icon: L.divIcon({ className: 'report-marker', html: '🐟', iconSize: [20, 20] })
    }).bindPopup(`<b>${species}</b><br>${weight || '—'} kg<br><small>${new Date().toLocaleString()}</small>`).addTo(reportLayer);
    saveCatch({ lat, lng, species, weight });
    reportMode = false;
    document.body.style.cursor = '';
    showToast(t('alert_report_saved'), 'success');
  }
  if (document.getElementById('auto-update-forecast').checked) {
    updateMapForecastPanel(lat, lng);
  }
}

async function searchLocation() {
  const q = document.getElementById('loc-input').value.trim();
  if (!q) return;
  if (/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(q)) {
    const [lat, lng] = q.split(',').map(s => parseFloat(s.trim()));
    map.setView([lat, lng], 9);
    updateMapForecastPanel(lat, lng);
    return;
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, {
      headers: { 'Accept-Language': lang === 'id' ? 'id' : 'en' }
    });
    const data = await res.json();
    if (!data.length) { showToast(t('alert_not_found'), 'warning'); return; }
    const { lat, lon } = data[0];
    map.setView([parseFloat(lat), parseFloat(lon)], 9);
    updateMapForecastPanel(parseFloat(lat), parseFloat(lon));
  } catch (e) { showToast(t('alert_search_failed'), 'error'); }
}

function clearReports() {
  if (!confirm(t('confirm_clear'))) return;
  reportLayer.clearLayers();
  localStorage.removeItem('gisfishit_favorites');
  showToast(t('alert_cleared'), 'success');
}

function exportFavorites() {
  const favs = allZoneMarkers.map(m => ({ lat: m.getLatLng().lat, lng: m.getLatLng().lng, zone: m.options.zoneKey }));
  const blob = new Blob([JSON.stringify(favs, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gisfishit-zones-${Date.now()}.json`;
  a.click();
}

/* Fish movement */
function toggleFishMovement() {
  fishMovementActive = !fishMovementActive;
  const btn = document.getElementById('btn-toggle-fish-movement');
  const status = document.getElementById('fish-movement-status');
  if (fishMovementActive) {
    btn.textContent = 'Stop Fish Movement';
    status.textContent = 'Moving';
    spawnFish();
    startFishMoveInterval();
  } else {
    btn.textContent = 'Start Fish Movement';
    status.textContent = 'Stopped';
    clearInterval(fishMoveInterval);
    movingFishMarkers.forEach(m => map.removeLayer(m.marker));
    movingFishMarkers = [];
  }
}

function spawnFish() {
  if (movingFishMarkers.length) return;
  for (let i = 0; i < 25; i++) {
    const lat = -10 + Math.random() * 20;
    const lng = 95 + Math.random() * 45;
    const marker = L.circleMarker([lat, lng], {
      radius: 4, color: '#ff9800', fillColor: '#ff9800', fillOpacity: .9, weight: 1
    }).addTo(map);
    marker.getElement()?.classList.add('moving-fish-marker');
    movingFishMarkers.push({ marker, lat, lng, dir: Math.random() * Math.PI * 2 });
  }
}

function startFishMoveInterval() {
  fishMoveInterval = setInterval(() => {
    movingFishMarkers.forEach(f => {
      f.dir += (Math.random() - .5) * .3;
      f.lat += Math.sin(f.dir) * .05 * fishSpeed / 3;
      f.lng += Math.cos(f.dir) * .05 * fishSpeed / 3;
      if (f.lat > 30) f.lat = -10;
      if (f.lat < -20) f.lat = 30;
      if (f.lng > 150) f.lng = 90;
      if (f.lng < 85) f.lng = 150;
      f.marker.setLatLng([f.lat, f.lng]);
    });
  }, 500);
}
