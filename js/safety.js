/* Safety Module v4 — GPS Breadcrumbs, Haversine/Bearing, Weather Danger Notification, SOS Confirmation Modal w/ SMS/Tel Fallback, CSV & GPX Export */
(function (win) {
  var watchId = null;
  var boatMarker = null;
  var breadcrumbLayer = null;
  var lastNotifiedDangerTs = 0;
  win.userLatLng = null;

  function calcDistanceKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calcBearingDeg(lat1, lng1, lat2, lng2) {
    var y = Math.sin((lng2 - lng1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
    var x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lng2 - lng1) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // Trigger native notification if dangerous 24h forecast detected
  function checkWeatherAlert(safetyResult) {
    if (!safetyResult || safetyResult.level !== 'danger') return;
    var settings = win.getSettings ? win.getSettings() : {};
    if (!settings.notificationsEnabled) return;
    if (!('Notification' in win) || Notification.permission !== 'granted') return;
    if (Date.now() - lastNotifiedDangerTs < 1800000) return;
    lastNotifiedDangerTs = Date.now();
    var wv = safetyResult.maxWave24h != null ? safetyResult.maxWave24h.toFixed(1) : '—';
    var wn = safetyResult.maxWind24h != null && win.kmhToKnot ? win.kmhToKnot(safetyResult.maxWind24h).toFixed(0) : '—';
    try {
      new Notification('GISFishIt — ' + (win.t('alert_weather_danger') || 'Peringatan Cuaca Berbahaya'), {
        body: 'Max 24 jam: Gelombang ' + wv + ' m, Angin ' + wn + ' knot. Hindari melaut (BMKG).'
      });
    } catch (e) { /* ignore if blocked */ }
  }

  function startGpsTracking(mapInstance) {
    if (!navigator.geolocation) {
      win.showToast('GPS tidak didukung di perangkat ini', 'error');
      return false;
    }
    if (watchId !== null) return true;
    if (!breadcrumbLayer && mapInstance) {
      breadcrumbLayer = L.layerGroup().addTo(mapInstance);
    }
    watchId = navigator.geolocation.watchPosition(
      function (pos) {
        var latitude = pos.coords.latitude;
        var longitude = pos.coords.longitude;
        win.userLatLng = { lat: latitude, lng: longitude };
        if (mapInstance) {
          if (!boatMarker) {
            boatMarker = L.circleMarker([latitude, longitude], {
              radius: 8,
              color: '#FAFAF5',
              fillColor: '#2C7A8C',
              fillOpacity: 1,
              weight: 2
            }).addTo(mapInstance).bindPopup('Posisi Kapal Anda');
          } else {
            boatMarker.setLatLng([latitude, longitude]);
          }
          if (breadcrumbLayer) {
            L.circleMarker([latitude, longitude], {
              radius: 3,
              color: '#8B6F47',
              fillColor: '#8B6F47',
              fillOpacity: 0.8,
              weight: 0
            }).addTo(breadcrumbLayer);
          }
        }
        win.saveBreadcrumb(latitude, longitude);
      },
      function (err) {
        win.showToast('GPS error: ' + err.message, 'error');
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    win.showToast(win.t('alert_gps_started'), 'success');
    return true;
  }

  function stopGpsTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      win.showToast(win.t('alert_gps_stopped'), 'info');
    }
  }

  function isGpsActive() {
    return watchId !== null;
  }

  function clearBreadcrumbLayer() {
    if (breadcrumbLayer) breadcrumbLayer.clearLayers();
  }

  async function clearBreadcrumb() {
    await win.clearBreadcrumbs();
    clearBreadcrumbLayer();
    win.showToast(win.t('alert_cleared'), 'info');
  }

  function getPrimaryEmergencyContact() {
    var s = win.getSettings();
    var idx = s.primaryContactIndex || 0;
    return (s.contacts && s.contacts[idx]) || (s.contacts && s.contacts[0]) || { name: 'SAR', phone: '6281234567890' };
  }

  function openSOSDialog() {
    var sosBtn = document.getElementById('btn-sos');
    if (sosBtn) {
      sosBtn.classList.add('sos-clicked');
      setTimeout(function () { sosBtn.classList.remove('sos-clicked'); }, 450);
    }

    var dialog = document.getElementById('sos-dialog');
    if (!dialog) return;
    var contact = getPrimaryEmergencyContact();
    var phone = String(contact.phone || '6281234567890').replace(/[^\d]/g, '');
    var textEl = document.getElementById('sos-confirm-msg');
    var countEl = document.getElementById('sos-countdown');
    var sendWaBtn = document.getElementById('sos-send-wa');
    var sendSmsBtn = document.getElementById('sos-send-sms');
    var sendTelBtn = document.getElementById('sos-send-tel');

    textEl.textContent = 'SOS akan buka WhatsApp/SMS ke ' + contact.name + ' (+' + phone + '). Yakin?';

    var sec = 3;
    countEl.textContent = String(sec);
    sendWaBtn.disabled = true;

    if (dialog._sosTimer) clearInterval(dialog._sosTimer);
    dialog._sosTimer = setInterval(function () {
      sec -= 1;
      if (sec <= 0) {
        clearInterval(dialog._sosTimer);
        dialog._sosTimer = null;
        countEl.textContent = 'Siap';
        sendWaBtn.disabled = false;
      } else {
        countEl.textContent = String(sec);
      }
    }, 1000);

    function triggerAnchor(href, newTab) {
      var a = document.createElement('a');
      a.href = href;
      if (newTab) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function buildCoordsAndLaunch(mode) {
      var launch = function (lat, lng) {
        var coordText = (lat != null && lng != null)
          ? lat.toFixed(6) + ', ' + lng.toFixed(6)
          : 'GPS tidak tersedia';
        var mapLink = (lat != null && lng != null)
          ? 'https://maps.google.com/?q=' + lat + ',' + lng
          : '-';
        var msg = 'SOS DARURAT GISFishIt\nSaya butuh bantuan di laut.\nPosisi: ' + coordText + '\nPeta: ' + mapLink + '\nWaktu: ' + new Date().toLocaleString('id-ID');
        var smsHref = 'sms:+' + phone + '?body=' + encodeURIComponent(msg);

        if (mode === 'wa') {
          var waHref = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
          // Jika offline, langsung fallback ke SMS agar tidak buntu di laut
          if (!navigator.onLine) {
            win.showToast('Sinyal data offline — beralih ke SMS darurat', 'warning');
            triggerAnchor(smsHref, false);
          } else {
            triggerAnchor(waHref, true);
          }
        } else if (mode === 'sms') {
          triggerAnchor(smsHref, false);
        } else {
          triggerAnchor('tel:+' + phone, false);
        }

        dialog.close();
        win.showToast('SOS diteruskan ke ' + contact.name, 'success');
      };

      if (!navigator.geolocation) {
        launch(null, null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) { launch(pos.coords.latitude, pos.coords.longitude); },
        function () {
          if (win.userLatLng) launch(win.userLatLng.lat, win.userLatLng.lng);
          else launch(null, null);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }

    sendWaBtn.onclick = function () { buildCoordsAndLaunch('wa'); };
    sendSmsBtn.onclick = function () { buildCoordsAndLaunch('sms'); };
    sendTelBtn.onclick = function () { buildCoordsAndLaunch('tel'); };

    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    var hintEl = document.getElementById('sos-fallback-hint');
    if (hintEl) {
      hintEl.textContent = isMobile
        ? 'Jika WhatsApp diblokir/offline, gunakan tombol Fallback SMS atau Panggil Telepon.'
        : 'Perangkat desktop: gunakan WhatsApp Web atau fallback SMS/Telepon.';
    }

    if (typeof dialog.showModal === 'function') dialog.showModal();
  }

  async function exportCatchesCSV() {
    var rows = await win.getAllCatches();
    if (!rows.length) {
      win.showToast('Belum ada catatan tangkapan', 'warning');
      return;
    }
    var header = 'Tanggal,Spesies,Berat(kg),Latitude,Longitude,Catatan\n';
    var body = rows.map(function (r) {
      return new Date(r.createdAt).toISOString() + ',"' + String(r.species || '').replace(/"/g, '""') + '",' +
        (r.weight != null ? r.weight : '') + ',' + (r.lat != null ? r.lat : '') + ',' + (r.lng != null ? r.lng : '') +
        ',"' + String(r.note || '').replace(/"/g, '""') + '"';
    }).join('\n');
    var blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gisfishit-catch-log-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    win.showToast('Catch log diekspor ke CSV', 'success');
    win.celebrate();
  }

  async function exportBreadcrumbsGPX() {
    var pts = await win.getAllBreadcrumbs();
    if (!pts.length) {
      win.showToast('Belum ada jejak GPS tersimpan', 'warning');
      return;
    }
    var trkpts = pts.map(function (p) {
      return '      <trkpt lat="' + p.lat + '" lon="' + p.lng + '"><time>' + new Date(p.ts).toISOString() + '</time></trkpt>';
    }).join('\n');
    var gpx = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="GISFishIt v4">\n' +
      '  <trk><name>GISFishIt Track</name><trkseg>\n' + trkpts + '\n  </trkseg></trk>\n</gpx>';
    var blob = new Blob([gpx], { type: 'application/gpx+xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gisfishit-track-' + new Date().toISOString().slice(0, 10) + '.gpx';
    a.click();
    URL.revokeObjectURL(url);
    win.showToast('Jejak GPS diekspor ke GPX', 'success');
  }

  win.calcDistanceKm = calcDistanceKm;
  win.calcBearingDeg = calcBearingDeg;
  win.checkWeatherAlert = checkWeatherAlert;
  win.startGpsTracking = startGpsTracking;
  win.stopGpsTracking = stopGpsTracking;
  win.isGpsActive = isGpsActive;
  win.clearBreadcrumbLayer = clearBreadcrumbLayer;
  win.clearBreadcrumb = clearBreadcrumb;
  win.openSOSDialog = openSOSDialog;
  win.exportCatchesCSV = exportCatchesCSV;
  win.exportBreadcrumbsGPX = exportBreadcrumbsGPX;
})(window);
