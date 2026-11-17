/* Map Module — Leaflet preferCanvas, ResizeObserver (FIX #20), Cluster State Preserved (FIX #5), Favorites (FIX #7), Route Planning, Nominatim Autocomplete (FIX #13) */
(function (win) {
  var map, zoneCluster, reportLayer, kkpLayer, routeLayer;
  var allZoneMarkers = [];
  var reportMode = false;
  var fishMovementActive = false;
  var fishMoveInterval = null;
  var fishSpeed = 3;
  var movingFishMarkers = [];
  var lastForecastLatLng = null;
  var currentBasemap = null;
  var tileEsri = null;
  var tileDark = null;
  var communityLoaded = false;

  function initMap() {
    map = L.map('map', { worldCopyJump: true, preferCanvas: true }).setView([-2, 118], 5);

    tileEsri = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri', maxNativeZoom: 18, maxZoom: 19 }
    );
    tileDark = L.layerGroup([
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        { attribution: '&copy; Esri', maxNativeZoom: 16, maxZoom: 19 }
      ),
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        { attribution: '', maxNativeZoom: 16, maxZoom: 19 }
      )
    ]);

    currentBasemap = document.body.classList.contains('dark') ? tileDark : tileEsri;
    currentBasemap.addTo(map);

    zoneCluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
    map.addLayer(zoneCluster);
    reportLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);

    // FIX #20: ResizeObserver keeps map properly sized across viewport & drawer transitions
    var wrapper = document.getElementById('map-wrapper');
    if (wrapper && 'ResizeObserver' in win) {
      new ResizeObserver(function () {
        if (map) map.invalidateSize();
      }).observe(wrapper);
    }

    loadKKPZones(true);
    generateZones();

    map.on('click', onMapClick);
    bindMapControls();
  }

  function setMapTheme(isDark) {
    if (!map) return;
    if (currentBasemap && map.hasLayer(currentBasemap)) map.removeLayer(currentBasemap);
    currentBasemap = isDark ? tileDark : tileEsri;
    currentBasemap.addTo(map);
  }

  function ensureCommunityLoaded() {
    if (communityLoaded || !map) return;
    communityLoaded = true;
    win.initSupabase().then(function () {
      win.loadCommunityReports(map);
    });
  }

  async function loadKKPZones(silent) {
    win.startProgress();
    try {
      var res = await fetch('data/kkp-zones.geojson');
      if (!res.ok) throw new Error('KKP GeoJSON 404');
      var geojson = await res.json();
      renderGeoJSONLayer(geojson, 'Sumber: KKP/BIG');
      win.showToast(win.t('alert_kkp_loaded'), 'success');
    } catch (e) {
      win.logger.warn('KKP unavailable:', e);
      if (!silent) win.showToast(win.t('alert_kkp_failed'), 'warning');
    } finally {
      win.finishProgress();
    }
  }

  function renderGeoJSONLayer(geojson, sourceLabel) {
    if (kkpLayer && map.hasLayer(kkpLayer)) map.removeLayer(kkpLayer);
    kkpLayer = L.geoJSON(geojson, {
      style: function () {
        return { color: '#2C7A8C', fillColor: '#5BB8CC', fillOpacity: 0.28, weight: 2 };
      },
      onEachFeature: function (f, layer) {
        var props = f.properties || {};
        layer.bindPopup(
          '<b>' + (props.NAMA_KK || props.name || 'Kawasan Konservasi') + '</b><br>' +
          '<small>' + sourceLabel + ' • Data KKP — update manual</small><br>' +
          '<small>Bukan pengganti info resmi KKP</small>'
        );
      }
    }).addTo(map);
  }

  function buildZonePopupHtml(lat, lng, zone, regionName) {
    var favActive = win.isFavorite(lat, lng);
    var distLine = '';
    if (win.userLatLng) {
      var dist = win.calcDistanceKm(win.userLatLng.lat, win.userLatLng.lng, lat, lng);
      distLine = '<div class="small">📍 ' + dist.toFixed(1) + ' km dari posisi Anda</div>';
    }
    var uid = ('z_' + lat.toFixed(3) + '_' + lng.toFixed(3)).replace(/[^a-zA-Z0-9_]/g, '_');
    return '<div>' +
      '<b>' + zone.label + ' (SIMULASI)</b><br>' +
      '<small>Region: ' + regionName + ' • ' + (zone.criteria || '') + '</small><br>' +
      '<small>⚠️ Zona simulasi edukasi, bukan data resmi.</small>' +
      '<div class="small" style="margin-top:4px"><span class="badge badge-caution" id="pop24_' + uid + '">Max 24 jam: Memuat...</span></div>' +
      distLine +
      '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn small popup-fav-btn" data-lat="' + lat + '" data-lng="' + lng + '" data-zone="' + zone.key + '" data-region="' + regionName + '">' +
      (favActive ? '★ Tersimpan' : '☆ Simpan ke Favorit') + '</button>' +
      '<button type="button" class="btn small popup-route-btn" data-lat="' + lat + '" data-lng="' + lng + '">Rute ke Sini</button>' +
      '</div></div>';
  }

  function generateZones() {
    if (!zoneCluster) return;
    zoneCluster.clearLayers();
    allZoneMarkers = [];

    // 8 coastal regions x 8 = 64 markers (well within <= 100 active marker budget for 2GB RAM)
    win.coastalRegions.forEach(function (region) {
      for (var i = 0; i < 8; i++) {
        (function () {
          var lat = region.latMin + Math.random() * (region.latMax - region.latMin);
          var lng = region.lngMin + Math.random() * (region.lngMax - region.lngMin);
          var roll = Math.random();
          var zone = roll < 0.6 ? win.zoneDefs[0] : roll < 0.85 ? win.zoneDefs[1] : win.zoneDefs[2];

          var marker = L.circleMarker([lat, lng], {
            radius: 10,
            color: zone.color,
            fillColor: zone.color,
            fillOpacity: 0.6,
            weight: 2,
            zoneKey: zone.key,
            regionName: region.name
          });

          marker.on('add', function () {
            var el = marker.getElement();
            if (el) {
              el.classList.add(zone.key === 'red' ? 'zone-pulse-danger' : 'zone-bob-safe');
            }
          });

          marker.bindPopup(function () {
            return buildZonePopupHtml(lat, lng, zone, region.name);
          });

          // FIX #6: Stop propagation so clicking marker does not trigger map.on('click')
          marker.on('click', async function (e) {
            L.DomEvent.stopPropagation(e);
            lastForecastLatLng = { lat: lat, lng: lng };
            var data = await win.updateMapForecastPanel(lat, lng);
            var uid = ('z_' + lat.toFixed(3) + '_' + lng.toFixed(3)).replace(/[^a-zA-Z0-9_]/g, '_');
            var badgeEl = document.getElementById('pop24_' + uid);
            if (badgeEl) {
              var safety = win.assessSafety(data);
              if (safety && safety.maxWave24h != null) {
                var maxKt = win.kmhToKnot(safety.maxWind24h || 0).toFixed(0);
                badgeEl.textContent = 'Max 24 jam: ' + safety.maxWave24h.toFixed(1) + ' m / ' + maxKt + ' knot';
                badgeEl.className = 'badge ' + safety.cls;
              } else {
                badgeEl.textContent = win.t('safety_no_data');
              }
            }
          });

          // Right-click straight-line route planning
          marker.on('contextmenu', function (e) {
            L.DomEvent.stopPropagation(e);
            planRouteTo(lat, lng);
          });

          allZoneMarkers.push(marker);
          zoneCluster.addLayer(marker);
        })();
      }
    });
    applyZoneFilters();
  }

  // FIX #5: Add/remove individual markers instead of clearLayers() so cluster state is preserved
  function applyZoneFilters() {
    var showGreen = document.getElementById('show-green').checked;
    var showYellow = document.getElementById('show-yellow').checked;
    var showRed = document.getElementById('show-red').checked;
    allZoneMarkers.forEach(function (m) {
      var zk = m.options.zoneKey;
      var shouldShow = (zk === 'green' && showGreen) || (zk === 'yellow' && showYellow) || (zk === 'red' && showRed);
      var has = zoneCluster.hasLayer(m);
      if (shouldShow && !has) zoneCluster.addLayer(m);
      else if (!shouldShow && has) zoneCluster.removeLayer(m);
    });
  }

  function planRouteTo(destLat, destLng) {
    var origin = win.userLatLng || { lat: -6.10, lng: 106.88 };
    if (!win.userLatLng) {
      win.showToast('GPS belum aktif — menghitung rute dari Pelabuhan Muara Baru, Jakarta', 'info');
    }
    routeLayer.clearLayers();
    L.polyline([[origin.lat, origin.lng], [destLat, destLng]], {
      color: '#E86A5F',
      weight: 3,
      dashArray: '8, 8'
    }).addTo(routeLayer);

    var distKm = win.calcDistanceKm(origin.lat, origin.lng, destLat, destLng);
    var bearing = win.calcBearingDeg(origin.lat, origin.lng, destLat, destLng);
    var cardinal = win.degToCardinal(bearing);
    var settings = win.getSettings();
    var speed = settings.boat.speedKmh || 10;
    var fuelLph = settings.boat.fuelLph || 4.5;
    var hours = distKm / speed;
    var fuel = hours * fuelLph;

    var card = document.getElementById('route-plan-card');
    if (card) {
      card.hidden = false;
      card.innerHTML =
        '<strong>Rencana Rute Garis Lurus</strong><br>' +
        'Jarak: <span class="num">' + distKm.toFixed(1) + ' km</span> • Haluan: <span class="num">' + Math.round(bearing) + '° (' + cardinal + ')</span><br>' +
        'Estimasi: <span class="num">' + hours.toFixed(1) + ' jam</span> • BBM: <span class="num">' + fuel.toFixed(1) + ' L</span><br>' +
        '<small class="small">Rute garis lurus — hindari daratan &amp; karang manual.</small>';
    }
    map.fitBounds([[origin.lat, origin.lng], [destLat, destLng]], { padding: [40, 40] });
  }

  function bindMapControls() {
    document.getElementById('show-green').addEventListener('change', applyZoneFilters);
    document.getElementById('show-yellow').addEventListener('change', applyZoneFilters);
    document.getElementById('show-red').addEventListener('change', applyZoneFilters);

    // Single manual Generate New Zones binding (FIX #2)
    document.getElementById('btn-gen').addEventListener('click', function () {
      generateZones();
      win.showToast('Zona simulasi diperbarui', 'success');
    });

    document.getElementById('btn-load-kkp').addEventListener('click', function () { loadKKPZones(false); });
    document.getElementById('btn-import-geojson').addEventListener('click', importGeoJSONFile);
    document.getElementById('btn-export-fav').addEventListener('click', exportFavorites);
    document.getElementById('btn-clear-reports').addEventListener('click', clearReports);
    document.getElementById('btn-home').addEventListener('click', function () { map.setView([-2, 118], 5); });

    document.getElementById('btn-refresh-forecast').addEventListener('click', function () {
      if (lastForecastLatLng) win.updateMapForecastPanel(lastForecastLatLng.lat, lastForecastLatLng.lng);
      else win.showToast('Klik peta terlebih dahulu', 'warning');
    });

    var unitSel = document.getElementById('forecast-unit-toggle');
    if (unitSel) {
      var s = win.getSettings ? win.getSettings() : {};
      unitSel.value = s.windUnit || 'knot';
      unitSel.addEventListener('change', function () {
        var cur = win.getSettings ? win.getSettings() : {};
        cur.windUnit = unitSel.value;
        if (win.saveSettings) win.saveSettings(cur);
        if (lastForecastLatLng) win.updateMapForecastPanel(lastForecastLatLng.lat, lastForecastLatLng.lng);
        if (document.getElementById('weatherSection').classList.contains('active')) {
          win.renderWeatherTab();
        }
      });
    }

    // Fish movement + Reset Fish Positions (FIX #4)
    document.getElementById('btn-toggle-fish-movement').addEventListener('click', toggleFishMovement);
    document.getElementById('btn-reset-fish-positions').addEventListener('click', resetFishPositions);
    document.getElementById('fish-speed-slider').addEventListener('input', function (e) {
      fishSpeed = parseInt(e.target.value, 10);
      document.getElementById('fish-speed-value').textContent = fishSpeed + 'x';
      if (fishMovementActive) {
        clearInterval(fishMoveInterval);
        startFishMoveInterval();
      }
    });

    // GPS Breadcrumb controls (FIX #22)
    document.getElementById('btn-toggle-gps').addEventListener('click', function () {
      if (win.isGpsActive()) {
        win.stopGpsTracking();
        document.getElementById('btn-toggle-gps').textContent = win.t('btn_start_gps');
      } else {
        if (win.startGpsTracking(map)) {
          document.getElementById('btn-toggle-gps').textContent = win.t('btn_stop_gps');
        }
      }
    });
    document.getElementById('btn-view-track').addEventListener('click', win.openBreadcrumbModal);
    document.getElementById('btn-clear-track').addEventListener('click', function () {
      win.openConfirmModal({
        title: 'Hapus Jejak GPS?',
        message: 'Hapus semua titik breadcrumb perjalanan?',
        confirmText: 'Hapus Jejak',
        danger: true,
        onConfirm: async function () {
          await win.clearBreadcrumb();
        }
      });
    });

    // SOS Confirmation Modal (FIX #15)
    document.getElementById('btn-sos').addEventListener('click', win.openSOSDialog);

    // Report mode toggle button + keyboard R
    var reportBtn = document.getElementById('btn-report-mode');
    if (reportBtn) reportBtn.addEventListener('click', toggleReportMode);

    document.addEventListener('keydown', function (e) {
      if (e.key.toLowerCase() === 'r' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        toggleReportMode();
      }
    });

    // Popup button delegation (Favorites & Route)
    document.addEventListener('click', function (e) {
      var favBtn = e.target.closest('.popup-fav-btn');
      if (favBtn) {
        var lat = parseFloat(favBtn.dataset.lat);
        var lng = parseFloat(favBtn.dataset.lng);
        var added = win.toggleFavorite({ lat: lat, lng: lng, zone: favBtn.dataset.zone, name: favBtn.dataset.region });
        favBtn.textContent = added ? '★ Tersimpan' : '☆ Simpan ke Favorit';
        win.showToast(added ? win.t('alert_fav_added') : win.t('alert_fav_removed'), added ? 'success' : 'info');
      }
      var routeBtn = e.target.closest('.popup-route-btn');
      if (routeBtn) {
        planRouteTo(parseFloat(routeBtn.dataset.lat), parseFloat(routeBtn.dataset.lng));
      }
    });

    // Mobile bottom sheet & forecast drawer & legend toggle
    var filterToggle = document.getElementById('btn-mobile-filters');
    var sheet = document.querySelector('.panel-floating');
    if (filterToggle && sheet) {
      filterToggle.addEventListener('click', function () { sheet.classList.toggle('sheet-open'); });
    }
    var layersToggle = document.getElementById('btn-mobile-layers');
    var drawer = document.querySelector('.marine-forecast-panel');
    if (layersToggle && drawer) {
      layersToggle.addEventListener('click', function () { drawer.classList.toggle('drawer-open'); });
    }
    var legendToggle = document.getElementById('legend-toggle-btn');
    var legendBox = document.querySelector('.legend');
    if (legendToggle && legendBox) {
      legendToggle.addEventListener('click', function () { legendBox.classList.toggle('collapsed'); });
    }
    var discChip = document.getElementById('disclaimer-chip-btn');
    var discExp = document.getElementById('disclaimer-expanded');
    if (discChip && discExp) {
      discChip.addEventListener('click', function () { discExp.classList.toggle('open'); });
    }

    initSearchAutocomplete();
  }

  function toggleReportMode() {
    reportMode = !reportMode;
    document.body.style.cursor = reportMode ? 'crosshair' : '';
    win.showToast(reportMode ? win.t('alert_report_mode_on') : 'Mode laporan nonaktif', reportMode ? 'info' : 'warning');
  }

  function onMapClick(e) {
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;
    lastForecastLatLng = { lat: lat, lng: lng };
    if (reportMode) {
      reportMode = false;
      document.body.style.cursor = '';
      win.openReportModal(lat, lng, function (entry) {
        win.submitCommunityReport({ lat: lat, lng: lng, species: entry.species, weight: entry.weight, note: entry.note });
        L.marker([lat, lng], {
          icon: L.divIcon({ className: 'report-marker', html: '🐟', iconSize: [20, 20] })
        })
          .bindPopup('<b>' + entry.species + '</b><br>' + (entry.weight != null ? entry.weight : '—') + ' kg<br>' + (entry.note || ''))
          .addTo(reportLayer);
        win.showToast(win.t('alert_report_saved'), 'success');
        win.celebrate();
      });
      return;
    }
    if (document.getElementById('auto-update-forecast').checked) {
      win.updateMapForecastPanel(lat, lng);
    }
  }

  // FIX #13: Debounced Nominatim autocomplete (limit=5, 7-day localStorage cache, keyboard nav)
  function initSearchAutocomplete() {
    var input = document.getElementById('loc-input');
    var list = document.getElementById('loc-autocomplete');
    var searchBtn = document.getElementById('btn-search');
    if (!input || !list) return;

    var debounceTimer = null;
    var activeIndex = -1;
    var currentItems = [];

    function closeList() {
      list.classList.remove('open');
      list.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      activeIndex = -1;
    }

    function selectItem(item) {
      input.value = item.display_name;
      closeList();
      var lat = parseFloat(item.lat);
      var lon = parseFloat(item.lon);
      lastForecastLatLng = { lat: lat, lng: lon };
      map.setView([lat, lon], 9);
      win.updateMapForecastPanel(lat, lon);
    }

    function renderSuggestions(items) {
      currentItems = items || [];
      if (!currentItems.length) { closeList(); return; }
      list.innerHTML = currentItems.map(function (it, i) {
        return '<li role="option" data-idx="' + i + '" aria-selected="false">' + it.display_name + '</li>';
      }).join('');
      list.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
      list.querySelectorAll('li').forEach(function (li) {
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          selectItem(currentItems[parseInt(li.dataset.idx, 10)]);
        });
      });
    }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < 3 || /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(q)) {
        closeList();
        return;
      }
      debounceTimer = setTimeout(async function () {
        var cached = win.getNominatimCache(q);
        if (cached) { renderSuggestions(cached); return; }
        try {
          var res = await fetch(
            'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=5',
            { headers: { 'Accept-Language': win.lang === 'id' ? 'id' : 'en' } }
          );
          if (!res.ok) return;
          var data = await res.json();
          win.setNominatimCache(q, data);
          renderSuggestions(data);
        } catch (e) { /* offline silent */ }
      }, 500);
    });

    input.addEventListener('keydown', function (e) {
      var items = list.querySelectorAll('li');
      if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        items.forEach(function (li, i) { li.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false'); });
      } else if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        items.forEach(function (li, i) { li.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false'); });
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && currentItems[activeIndex]) {
          e.preventDefault();
          selectItem(currentItems[activeIndex]);
        } else {
          closeList();
          searchLocation(input.value.trim());
        }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-combobox-wrap')) closeList();
    });

    if (searchBtn) {
      searchBtn.addEventListener('click', function () {
        closeList();
        searchLocation(input.value.trim());
      });
    }
  }

  async function searchLocation(queryOverride) {
    var q = (queryOverride != null ? queryOverride : document.getElementById('loc-input').value).trim();
    if (!q) return;
    if (/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(q)) {
      var parts = q.split(',').map(function (s) { return parseFloat(s.trim()); });
      lastForecastLatLng = { lat: parts[0], lng: parts[1] };
      map.setView([parts[0], parts[1]], 9);
      win.updateMapForecastPanel(parts[0], parts[1]);
      return;
    }
    var cached = win.getNominatimCache(q);
    if (cached && cached.length) {
      var latC = parseFloat(cached[0].lat), lonC = parseFloat(cached[0].lon);
      lastForecastLatLng = { lat: latC, lng: lonC };
      map.setView([latC, lonC], 9);
      win.updateMapForecastPanel(latC, lonC);
      return;
    }
    win.startProgress();
    try {
      var res = await fetch(
        'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=5',
        { headers: { 'Accept-Language': win.lang === 'id' ? 'id' : 'en' } }
      );
      var data = await res.json();
      if (!data.length) { win.showToast(win.t('alert_not_found'), 'warning'); return; }
      win.setNominatimCache(q, data);
      var lat = parseFloat(data[0].lat);
      var lon = parseFloat(data[0].lon);
      lastForecastLatLng = { lat: lat, lng: lon };
      map.setView([lat, lon], 9);
      win.updateMapForecastPanel(lat, lon);
    } catch (e) {
      win.showToast(win.t('alert_search_failed'), 'error');
    } finally {
      win.finishProgress();
    }
  }

  function importGeoJSONFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.geojson,.json';
    input.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var gj = JSON.parse(reader.result);
          if (!gj || !gj.type) throw new Error('Invalid GeoJSON');
          renderGeoJSONLayer(gj, 'GeoJSON Impor');
          if (kkpLayer && kkpLayer.getBounds && kkpLayer.getBounds().isValid()) {
            map.fitBounds(kkpLayer.getBounds());
          }
          win.showToast('GeoJSON berhasil dimuat', 'success');
        } catch (err) {
          win.showToast('File GeoJSON tidak valid', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function clearReports() {
    win.openConfirmModal({
      title: 'Hapus Laporan di Peta?',
      message: 'Bersihkan seluruh marker laporan tangkapan sementara di peta?',
      confirmText: 'Bersihkan',
      danger: true,
      onConfirm: function () {
        reportLayer.clearLayers();
        routeLayer.clearLayers();
        var rc = document.getElementById('route-plan-card');
        if (rc) rc.hidden = true;
        win.showToast(win.t('alert_cleared'), 'info');
      }
    });
  }

  // FIX #7: Export ONLY saved favorites
  function exportFavorites() {
    var favs = win.getFavorites();
    if (!favs.length) {
      win.showToast(win.t('alert_fav_empty'), 'warning');
      return;
    }
    var blob = new Blob([JSON.stringify(favs, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gisfishit-favorites-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    win.showToast('Favorit diekspor (' + favs.length + ' titik)', 'success');
    win.celebrate();
  }

  /* Fish movement (25 markers) */
  function toggleFishMovement() {
    fishMovementActive = !fishMovementActive;
    var btn = document.getElementById('btn-toggle-fish-movement');
    var status = document.getElementById('fish-movement-status');
    if (fishMovementActive) {
      btn.textContent = win.t('btn_stop_fish');
      status.textContent = 'Aktif';
      spawnFish();
      startFishMoveInterval();
    } else {
      btn.textContent = win.t('btn_start_fish');
      status.textContent = 'Berhenti';
      clearInterval(fishMoveInterval);
      fishMoveInterval = null;
    }
  }

  function spawnFish() {
    if (movingFishMarkers.length) return;
    for (var i = 0; i < 25; i++) {
      (function () {
        var lat = -10 + Math.random() * 20;
        var lng = 95 + Math.random() * 45;
        var marker = L.circleMarker([lat, lng], {
          radius: 4,
          color: '#D4A574',
          fillColor: '#D4A574',
          fillOpacity: 0.9,
          weight: 1
        });
        // FIX #14: Wait for 'add' before accessing element
        marker.on('add', function () {
          var el = marker.getElement();
          if (el) el.classList.add('moving-fish-marker');
        });
        marker.addTo(map);
        movingFishMarkers.push({ marker: marker, lat: lat, lng: lng, dir: Math.random() * Math.PI * 2 });
      })();
    }
  }

  // FIX #4: Reset Fish Positions removes all moving markers & resets movingFishMarkers = []
  function resetFishPositions() {
    clearInterval(fishMoveInterval);
    fishMoveInterval = null;
    fishMovementActive = false;
    movingFishMarkers.forEach(function (f) {
      if (map.hasLayer(f.marker)) map.removeLayer(f.marker);
    });
    movingFishMarkers = [];
    document.getElementById('btn-toggle-fish-movement').textContent = win.t('btn_start_fish');
    document.getElementById('fish-movement-status').textContent = 'Direset';
    win.showToast('Posisi ikan direset', 'info');
  }

  function startFishMoveInterval() {
    clearInterval(fishMoveInterval);
    // FIX #28: Check document.visibilityState before updating
    fishMoveInterval = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      movingFishMarkers.forEach(function (f) {
        f.dir += (Math.random() - 0.5) * 0.3;
        f.lat += Math.sin(f.dir) * 0.05 * fishSpeed / 3;
        f.lng += Math.cos(f.dir) * 0.05 * fishSpeed / 3;
        if (f.lat > 10) f.lat = -10;
        if (f.lat < -10) f.lat = 10;
        if (f.lng > 140) f.lng = 95;
        if (f.lng < 95) f.lng = 140;
        f.marker.setLatLng([f.lat, f.lng]);
      });
    }, 500);
  }

  win.initMap = initMap;
  win.setMapTheme = setMapTheme;
  win.ensureCommunityLoaded = ensureCommunityLoaded;
  win.searchLocation = searchLocation;
  win.getMapInstance = function () { return map; };
})(window);
