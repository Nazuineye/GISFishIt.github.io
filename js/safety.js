/* Safety Module — GPS, SOS, Catch Log (offline-first) */
let watchId = null;
let boatMarker = null;
let breadcrumbLayer = null;
let safetyDB = null;

function startGpsTracking(map) {
  if (!navigator.geolocation) { showToast(t('alert_gps_error') + 'Not supported', 'error'); return; }
  if (watchId) return;
  if (!breadcrumbLayer) breadcrumbLayer = L.layerGroup().addTo(map);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      if (!boatMarker) {
        boatMarker = L.circleMarker([latitude, longitude], {
          radius: 8, color: '#fff', fillColor: '#1572e8', fillOpacity: 1, weight: 2
        }).addTo(map).bindPopup('Posisi Anda');
      } else boatMarker.setLatLng([latitude, longitude]);
      L.circleMarker([latitude, longitude], { radius: 3, color: '#1572e8', fillOpacity: .7, weight: 0 }).addTo(breadcrumbLayer);
      saveBreadcrumb(latitude, longitude);
    },
    (err) => showToast(t('alert_gps_error') + err.message, 'error'),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
  showToast(t('alert_gps_started'), 'success');
}

function stopGpsTracking() {
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function sendSOS(emergencyPhone = EMERGENCY_PHONE) {
  if (!navigator.geolocation) { showToast('GPS tidak didukung', 'error'); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const msg = `🆘 SOS DARURAT GISFishIt\nSaya butuh bantuan di laut.\nPosisi: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nPeta: https://maps.google.com/?q=${latitude},${longitude}\nWaktu: ${new Date().toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}`;
      window.open(`https://wa.me/${emergencyPhone}?text=${encodeURIComponent(msg)}`, '_blank');
      showToast(t('alert_sos_sent'), 'success');
    },
    (err) => showToast('Gagal dapat posisi GPS: ' + err.message, 'error'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function openSafetyDB() {
  return new Promise((resolve, reject) => {
    if (safetyDB) return resolve(safetyDB);
    const req = indexedDB.open('gisfishit-safety', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('breadcrumbs')) db.createObjectStore('breadcrumbs', { autoIncrement: true });
      if (!db.objectStoreNames.contains('catches')) db.createObjectStore('catches', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = (e) => { safetyDB = e.target.result; resolve(safetyDB); };
    req.onerror = () => reject(req.error);
  });
}

async function saveBreadcrumb(lat, lng) {
  try {
    const db = await openSafetyDB();
    db.transaction('breadcrumbs', 'readwrite').objectStore('breadcrumbs').add({ lat, lng, ts: Date.now() });
  } catch (e) { /* silent */ }
}

async function saveCatch(entry) {
  const db = await openSafetyDB();
  db.transaction('catches', 'readwrite').objectStore('catches').add({ ...entry, createdAt: Date.now() });
  showToast('Tangkapan tersimpan', 'success');
}

async function getAllCatches() {
  const db = await openSafetyDB();
  return new Promise((resolve) => {
    const req = db.transaction('catches', 'readonly').objectStore('catches').getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function exportCatchesCSV() {
  const rows = await getAllCatches();
  if (!rows.length) { showToast('Belum ada catatan tangkapan', 'warning'); return; }
  const header = 'Tanggal,Spesies,Berat(kg),Latitude,Longitude,Catatan\n';
  const body = rows.map(r => `${new Date(r.createdAt).toISOString()},${r.species || ''},${r.weight || ''},${r.lat || ''},${r.lng || ''},"${(r.note || '').replace(/"/g, '""')}"`).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gisfishit-catch-log-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Catch log diekspor', 'success');
}
