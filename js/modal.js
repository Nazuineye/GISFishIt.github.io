/* Modals Module — Native <dialog> for Confirm, Fish Detail, Catch Log Viewer, Breadcrumb Viewer, Report Form, Onboarding Tour */
(function (win) {
  var catchMiniMap = null;
  var breadcrumbMiniMap = null;

  function openConfirmModal(opts) {
    var dlg = document.getElementById('confirm-dialog');
    if (!dlg) return;
    document.getElementById('confirm-title').textContent = opts.title || 'Konfirmasi';
    document.getElementById('confirm-message').textContent = opts.message || '';
    var okBtn = document.getElementById('confirm-ok-btn');
    okBtn.textContent = opts.confirmText || 'Ya';
    okBtn.className = opts.danger ? 'btn danger' : 'btn primary';
    okBtn.onclick = function () {
      dlg.close();
      if (typeof opts.onConfirm === 'function') opts.onConfirm();
    };
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  function openFishModal(fish) {
    var dlg = document.getElementById('fish-dialog');
    if (!dlg || !fish) return;
    document.getElementById('fish-modal-title').textContent = fish.name;
    document.getElementById('fish-modal-svg').innerHTML = win.FISH_SVGS[fish.svgType] || win.FISH_SVGS.tuna;
    document.getElementById('fish-modal-desc').textContent = fish.desc;
    document.getElementById('fish-modal-price').textContent = fish.price;
    document.getElementById('fish-modal-locations').textContent = fish.locations;
    document.getElementById('fish-modal-habitat').textContent = fish.habitat;
    document.getElementById('fish-modal-season').textContent = fish.season;

    document.getElementById('fish-view-map-btn').onclick = function () {
      dlg.close();
      win.switchTab('mapSection');
      var locInput = document.getElementById('loc-input');
      if (locInput) {
        locInput.value = fish.locations.split(',')[0].trim();
        win.searchLocation(locInput.value);
      }
    };
    document.getElementById('fish-view-log-btn').onclick = function () {
      dlg.close();
      openCatchLogModal(fish.name);
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  async function openCatchLogModal(initialSpecies) {
    var dlg = document.getElementById('catchlog-dialog');
    if (!dlg) return;
    var rows = await win.getAllCatches();
    var spFilter = document.getElementById('catch-filter-species');
    var dateFilter = document.getElementById('catch-filter-date');
    spFilter.value = initialSpecies || '';
    dateFilter.value = '';

    function renderList() {
      var spQ = spFilter.value.trim().toLowerCase();
      var dtQ = dateFilter.value;
      var filtered = rows.filter(function (r) {
        var matchSp = !spQ || String(r.species || '').toLowerCase().indexOf(spQ) !== -1;
        var matchDt = !dtQ || new Date(r.createdAt).toISOString().slice(0, 10) === dtQ;
        return matchSp && matchDt;
      });

      var totalKg = filtered.reduce(function (sum, r) { return sum + (parseFloat(r.weight) || 0); }, 0);
      var speciesSet = new Set(filtered.map(function (r) { return String(r.species || '').toLowerCase(); }).filter(Boolean));
      document.getElementById('catchlog-stats').textContent =
        'Total ' + filtered.length + ' tangkapan • ' + totalKg.toFixed(1) + ' kg • ' + speciesSet.size + ' spesies';

      var listEl = document.getElementById('catchlog-list');
      if (!filtered.length) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-fish-bob">' + win.FISH_SVGS.tuna + '</div><p class="small">Belum ada catatan tangkapan.</p></div>';
      } else {
        listEl.innerHTML = filtered.slice().reverse().map(function (r) {
          var loc = (r.lat != null && r.lng != null) ? r.lat.toFixed(3) + ', ' + r.lng.toFixed(3) : '—';
          return '<div class="timeline-entry"><div><strong>' + (r.species || 'Ikan') + '</strong><div class="small">' +
            new Date(r.createdAt).toLocaleString('id-ID') + ' • ' + loc + '</div>' +
            (r.note ? '<div class="small">' + r.note + '</div>' : '') +
            '</div><div class="num"><strong>' + (r.weight != null ? r.weight + ' kg' : '—') + '</strong></div></div>';
        }).join('');
      }

      // Mini preview map
      var mapEl = document.getElementById('catchlog-mini-map');
      if (mapEl && typeof L !== 'undefined') {
        setTimeout(function () {
          if (catchMiniMap) { catchMiniMap.remove(); catchMiniMap = null; }
          catchMiniMap = L.map(mapEl, { preferCanvas: true }).setView([-2, 118], 4);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(catchMiniMap);
          var pts = [];
          filtered.forEach(function (r) {
            if (r.lat != null && r.lng != null) {
              pts.push([r.lat, r.lng]);
              L.circleMarker([r.lat, r.lng], { radius: 6, color: '#8B6F47', fillColor: '#D4A574', fillOpacity: 0.9 }).addTo(catchMiniMap)
                .bindPopup((r.species || '') + ' (' + (r.weight || '—') + ' kg)');
            }
          });
          if (pts.length) catchMiniMap.fitBounds(pts, { padding: [20, 20], maxZoom: 10 });
        }, 80);
      }
    }

    spFilter.oninput = renderList;
    dateFilter.onchange = renderList;
    document.getElementById('catchlog-export-csv').onclick = win.exportCatchesCSV;
    document.getElementById('catchlog-clear-btn').onclick = function () {
      openConfirmModal({
        title: 'Hapus Semua Catch Log?',
        message: 'Semua catatan tangkapan akan dihapus permanen.',
        confirmText: 'Lanjutkan',
        danger: true,
        onConfirm: function () {
          openConfirmModal({
            title: 'Konfirmasi Hapus Catch Log',
            message: 'Yakin hapus seluruh catch log dari perangkat?',
            confirmText: 'Ya, Hapus',
            danger: true,
            onConfirm: async function () {
              await win.clearCatches();
              rows = [];
              renderList();
              win.showToast('Catch log dibersihkan', 'info');
            }
          });
        }
      });
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    renderList();
  }

  async function openBreadcrumbModal() {
    var dlg = document.getElementById('breadcrumb-dialog');
    if (!dlg) return;
    var pts = await win.getAllBreadcrumbs();

    var distKm = 0;
    for (var i = 1; i < pts.length; i++) {
      distKm += win.calcDistanceKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    }
    var durMin = pts.length > 1 ? Math.round((pts[pts.length - 1].ts - pts[0].ts) / 60000) : 0;
    var startStr = pts.length ? new Date(pts[0].ts).toLocaleTimeString('id-ID') : '—';
    var endStr = pts.length ? new Date(pts[pts.length - 1].ts).toLocaleTimeString('id-ID') : '—';

    document.getElementById('breadcrumb-stats').textContent =
      pts.length + ' titik • Jarak ' + distKm.toFixed(2) + ' km • Durasi ' + durMin + ' menit • Awal ' + startStr + ' → Akhir ' + endStr;

    document.getElementById('breadcrumb-export-gpx').onclick = win.exportBreadcrumbsGPX;
    document.getElementById('breadcrumb-clear-btn').onclick = function () {
      openConfirmModal({
        title: 'Hapus Jejak Perjalanan?',
        message: 'Seluruh titik breadcrumb GPS akan dihapus dari perangkat.',
        confirmText: 'Lanjutkan',
        danger: true,
        onConfirm: function () {
          openConfirmModal({
            title: 'Konfirmasi Terakhir',
            message: 'Yakin hapus semua jejak GPS?',
            confirmText: 'Ya, Hapus Jejak',
            danger: true,
            onConfirm: async function () {
              await win.clearBreadcrumbs();
              win.clearBreadcrumbLayer();
              if (breadcrumbMiniMap) breadcrumbMiniMap.setView([-2, 118], 4);
              document.getElementById('breadcrumb-stats').textContent = '0 titik • Jarak 0.00 km';
              win.showToast('Jejak perjalanan dihapus', 'info');
            }
          });
        }
      });
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();

    var mapEl = document.getElementById('breadcrumb-mini-map');
    if (mapEl && typeof L !== 'undefined') {
      setTimeout(function () {
        if (breadcrumbMiniMap) { breadcrumbMiniMap.remove(); breadcrumbMiniMap = null; }
        breadcrumbMiniMap = L.map(mapEl, { preferCanvas: true }).setView([-2, 118], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(breadcrumbMiniMap);
        if (pts.length) {
          var latlngs = pts.map(function (p) { return [p.lat, p.lng]; });
          L.polyline(latlngs, { color: '#8B6F47', weight: 3 }).addTo(breadcrumbMiniMap);
          L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#2C7A8C', fillOpacity: 1 }).addTo(breadcrumbMiniMap);
          breadcrumbMiniMap.fitBounds(latlngs, { padding: [20, 20], maxZoom: 13 });
        }
      }, 80);
    }
  }

  // Custom Report Form modal (replaces native prompt())
  function openReportModal(lat, lng, onSave) {
    var dlg = document.getElementById('report-dialog');
    if (!dlg) return;
    document.getElementById('report-coords').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
    var spEl = document.getElementById('report-species');
    var wtEl = document.getElementById('report-weight');
    var ntEl = document.getElementById('report-note');
    var errEl = document.getElementById('report-species-group');
    spEl.value = '';
    wtEl.value = '';
    ntEl.value = '';
    errEl.classList.remove('invalid');

    var form = document.getElementById('report-form');
    form.onsubmit = function (e) {
      e.preventDefault();
      var species = spEl.value.trim();
      if (!species) {
        errEl.classList.add('invalid', 'shake');
        setTimeout(function () { errEl.classList.remove('shake'); }, 420);
        return;
      }
      var w = parseFloat(wtEl.value);
      dlg.close();
      if (typeof onSave === 'function') {
        onSave({
          species: species,
          weight: Number.isNaN(w) ? null : w,
          note: ntEl.value.trim()
        });
      }
    };
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  // 5-Step Onboarding Tour
  function startOnboardingTour(force) {
    if (!force && localStorage.getItem('gisfishit_tour_done') === '1') return;
    var dlg = document.getElementById('tour-dialog');
    if (!dlg) return;

    var steps = [
      { sel: 'nav.top', title: '1/5 — Navigasi Utama', desc: 'Beralih cepat antara Beranda, Peta Zona Tangkap, Cuaca Laut, Info Ikan, dan Tentang Kami.' },
      { sel: '#open-settings-btn', title: '2/5 — Pengaturan & Kontak SOS', desc: 'Atur kontak darurat keluarga/SAR, profil kapal (kecepatan & BBM), serta mode gelap otomatis.' },
      { sel: '#home-weather-widget', title: '3/5 — Widget Cuaca Real-Time', desc: 'Pantau suhu, gelombang, dan status keselamatan melaut langsung dari beranda.' },
      { sel: '#hero-map-cta', title: '4/5 — Peta Zona & Rute', desc: 'Buka peta untuk melihat zona KKP resmi (biru), zona simulasi edukasi, rute kapal, dan tombol SOS.' },
      { sel: '#lang-select', title: '5/5 — 6 Bahasa & Mode Offline', desc: 'Pilih dari 6 bahasa (termasuk Arab RTL) dan tetap gunakan data terakhir saat melaut tanpa sinyal.' }
    ];
    var stepIdx = 0;
    var activeSpotlight = null;

    function clearSpotlight() {
      if (activeSpotlight) {
        activeSpotlight.classList.remove('tour-spotlight');
        activeSpotlight = null;
      }
    }

    function renderStep() {
      clearSpotlight();
      var s = steps[stepIdx];
      document.getElementById('tour-title').textContent = s.title;
      document.getElementById('tour-desc').textContent = s.desc;
      document.getElementById('tour-next-btn').textContent = stepIdx === steps.length - 1 ? 'Selesai' : 'Lanjut';
      var el = document.querySelector(s.sel);
      if (el && el.offsetParent !== null) {
        el.classList.add('tour-spotlight');
        activeSpotlight = el;
      }
    }

    document.getElementById('tour-next-btn').onclick = function () {
      if (stepIdx < steps.length - 1) {
        stepIdx += 1;
        renderStep();
      } else {
        clearSpotlight();
        localStorage.setItem('gisfishit_tour_done', '1');
        dlg.close();
      }
    };
    document.getElementById('tour-skip-btn').onclick = function () {
      clearSpotlight();
      localStorage.setItem('gisfishit_tour_done', '1');
      dlg.close();
    };
    dlg.onclose = clearSpotlight;

    if (typeof dlg.showModal === 'function') dlg.showModal();
    renderStep();
  }

  win.openConfirmModal = openConfirmModal;
  win.openFishModal = openFishModal;
  win.openCatchLogModal = openCatchLogModal;
  win.openBreadcrumbModal = openBreadcrumbModal;
  win.openReportModal = openReportModal;
  win.startOnboardingTour = startOnboardingTour;
})(window);
