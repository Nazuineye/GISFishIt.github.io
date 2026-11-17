/* App Orchestrator — GISFishIt v3 */
(function (win) {
  var fishFilterType = 'all';

  function switchTab(target) {
    var sec = document.getElementById(target);
    if (!sec) return;
    document.querySelectorAll('.page-section').forEach(function (s) {
      s.classList.remove('active');
    });
    sec.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.target === target);
    });
    document.querySelectorAll('.mobile-nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.target === target);
    });
    win.updateNavIndicator();

    if (target === 'mapSection') {
      var m = win.getMapInstance();
      if (m) setTimeout(function () { m.invalidateSize(); }, 100);
      win.ensureCommunityLoaded();
    }
    if (target === 'weatherSection') {
      win.renderWeatherTab();
    }
    win.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function applyTheme(isDark, persist) {
    document.body.classList.toggle('dark', isDark);
    if (persist) localStorage.setItem('gisfishit_theme', isDark ? 'dark' : 'light');
    win.setMapTheme(isDark);
    var btn = document.getElementById('toggle-theme');
    if (btn) {
      btn.innerHTML = win.renderIcon(isDark ? 'sun' : 'moon', 18);
      btn.setAttribute('aria-label', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    }
  }

  function applyAutoDarkMode() {
    var saved = localStorage.getItem('gisfishit_theme');
    if (saved) {
      applyTheme(saved === 'dark', false);
      return;
    }
    var s = win.getSettings();
    var hr = new Date().getHours();
    var nightTime = s.autoDarkMode && (hr >= 18 || hr < 6);
    applyTheme(nightTime, false);
  }

  function updateOfflineBar() {
    var bar = document.getElementById('offline-bar');
    var timeEl = document.getElementById('offline-last-time');
    if (!bar) return;
    if (!navigator.onLine) {
      bar.classList.add('visible');
      if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } else {
      bar.classList.remove('visible');
    }
  }

  function renderFishCards() {
    var grid = document.getElementById('fish-grid');
    if (!grid) return;
    var q = (document.getElementById('fish-search-input')?.value || '').trim().toLowerCase();
    var sort = document.getElementById('fish-sort-select')?.value || 'name';

    var list = win.FISH_DATA.filter(function (f) {
      var typeOk = fishFilterType === 'all' || f.type === fishFilterType;
      var qOk = !q || f.name.toLowerCase().indexOf(q) !== -1 || f.locations.toLowerCase().indexOf(q) !== -1 || f.habitat.toLowerCase().indexOf(q) !== -1;
      return typeOk && qOk;
    });

    if (sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (sort === 'price-desc') list.sort(function (a, b) { return (b.priceNum || 0) - (a.priceNum || 0); });
    else if (sort === 'price-asc') list.sort(function (a, b) { return (a.priceNum || 0) - (b.priceNum || 0); });

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-fish-bob">' + win.FISH_SVGS.tuna + '</div><p>Tidak ada ikan yang cocok dengan pencarian Anda.</p><button type="button" class="btn small" id="fish-reset-filter">Reset Pencarian</button></div>';
      var resetBtn = document.getElementById('fish-reset-filter');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          document.getElementById('fish-search-input').value = '';
          fishFilterType = 'all';
          document.querySelectorAll('.fish-chip').forEach(function (c) { c.classList.toggle('active', c.dataset.type === 'all'); });
          renderFishCards();
        });
      }
      return;
    }

    grid.innerHTML = list.map(function (f, i) {
      var isFeatured = i % 5 === 0;
      var typeLabel = f.type === 'saltwater' ? 'Air Asin' : 'Air Tawar';
      return '<button type="button" class="fish-card hover-card' + (isFeatured ? ' featured' : '') + '" data-fish-name="' + f.name + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;width:100%">' +
        '<div class="fish-art-box">' + (win.FISH_SVGS[f.svgType] || win.FISH_SVGS.tuna) + '</div>' +
        '<span class="badge ' + (f.type === 'saltwater' ? 'badge-safe' : 'badge-caution') + '">' + typeLabel + '</span>' +
        '</div>' +
        '<h4>' + f.name + '</h4>' +
        '<div class="small">' + f.desc + '</div>' +
        '<div class="num" style="margin-top:auto;padding-top:8px"><strong>' + f.price + '</strong></div>' +
        '<div class="small">' + f.season + '</div>' +
        '</button>';
    }).join('');

    grid.querySelectorAll('.fish-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var fish = win.FISH_DATA.find(function (x) { return x.name === card.dataset.fishName; });
        if (fish) win.openFishModal(fish);
      });
    });
  }

  function initWeatherSearch() {
    var input = document.getElementById('weather-location-input');
    if (!input) return;
    input.addEventListener('keypress', async function (e) {
      if (e.key !== 'Enter') return;
      var q = input.value.trim();
      if (!q) return;
      if (/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(q)) {
        var parts = q.split(',').map(function (s) { return parseFloat(s.trim()); });
        win.renderWeatherTab(parts[0], parts[1], q);
        return;
      }
      var cached = win.getNominatimCache(q);
      if (cached && cached.length) {
        win.renderWeatherTab(parseFloat(cached[0].lat), parseFloat(cached[0].lon), q);
        return;
      }
      try {
        var res = await fetch(
          'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=1',
          { headers: { 'Accept-Language': win.lang === 'id' ? 'id' : 'en' } }
        );
        var data = await res.json();
        if (!data.length) { win.showToast(win.t('alert_not_found'), 'warning'); return; }
        win.setNominatimCache(q, data);
        win.renderWeatherTab(parseFloat(data[0].lat), parseFloat(data[0].lon), q);
      } catch (err) {
        win.showToast(win.t('alert_search_failed'), 'error');
      }
    });
  }

  function initFeedback() {
    var form = document.getElementById('feedback-form');
    if (!form) return;
    var phoneGroup = document.getElementById('fb-phone-group');
    var phoneEl = document.getElementById('fb-phone');
    var msgEl = document.getElementById('fb-message');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var phone = phoneEl.value.trim();
      var message = msgEl.value.trim();
      if (!phone || phone.length < 6) {
        phoneGroup.classList.add('invalid', 'shake');
        setTimeout(function () { phoneGroup.classList.remove('shake'); }, 420);
        win.showToast(win.t('alert_phone_required'), 'error');
        return;
      }
      phoneGroup.classList.remove('invalid');

      // FIX #24: Deduplicate & limit feedback to 50 entries
      var list = [];
      try { list = JSON.parse(localStorage.getItem('gisfishit_feedback') || '[]'); } catch (err) { list = []; }
      if (!Array.isArray(list)) list = [];
      var dup = list.some(function (item) { return item.phone === phone && item.message === message; });
      if (!dup) {
        list.push({ phone: phone, message: message, ts: Date.now() });
        while (list.length > 50) list.shift();
        localStorage.setItem('gisfishit_feedback', JSON.stringify(list));
      }
      document.getElementById('fb-status').textContent = win.t('alert_feedback_saved');
      phoneEl.value = '';
      msgEl.value = '';
      win.showToast(win.t('alert_feedback_saved'), 'success');
      win.celebrate();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // FIX #21: Restore persisted language
    var savedLang = localStorage.getItem('gisfishit_lang');
    win.lang = savedLang && win.LANGS[savedLang] ? savedLang : 'en';
    var langSel = document.getElementById('lang-select');
    if (langSel) {
      langSel.value = win.lang;
      langSel.addEventListener('change', function (e) {
        win.lang = e.target.value;
        localStorage.setItem('gisfishit_lang', win.lang);
        win.applyI18n();
        win.updateNavIndicator();
      });
    }

    // FIX #18: Apply i18n only after DOM ready
    win.applyI18n();

    // Theme + Auto Dark Mode
    applyAutoDarkMode();
    document.getElementById('toggle-theme')?.addEventListener('click', function () {
      applyTheme(!document.body.classList.contains('dark'), true);
    });

    // Offline indicator
    updateOfflineBar();
    win.addEventListener('online', updateOfflineBar);
    win.addEventListener('offline', updateOfflineBar);

    // Navigation (desktop & mobile)
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.target); });
    });
    document.querySelectorAll('.mobile-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.target === 'more') {
          var footer = document.querySelector('footer.site-footer');
          if (footer) footer.classList.toggle('hidden');
        } else {
          switchTab(btn.dataset.target);
        }
      });
    });

    document.getElementById('hero-map-cta')?.addEventListener('click', function () { switchTab('mapSection'); });
    document.getElementById('hero-learn-cta')?.addEventListener('click', function () {
      document.getElementById('home-features')?.scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('home-widget-detail')?.addEventListener('click', function () { switchTab('weatherSection'); });

    // Feature links
    document.querySelectorAll('.feature-jump').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        switchTab(a.dataset.target);
      });
    });

    // Init Map & Settings
    win.initMap();
    win.bindSettingsModal();
    document.getElementById('open-settings-btn')?.addEventListener('click', win.openSettingsModal);
    document.getElementById('open-tour-btn')?.addEventListener('click', function () { win.startOnboardingTour(true); });

    // Fish cards & filters
    renderFishCards();
    document.querySelectorAll('.fish-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.fish-chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        fishFilterType = chip.dataset.type;
        renderFishCards();
      });
    });
    document.getElementById('fish-search-input')?.addEventListener('input', renderFishCards);
    document.getElementById('fish-sort-select')?.addEventListener('change', renderFishCards);

    // Footer & Feedback
    var footer = document.querySelector('footer.site-footer');
    var showFooterBtn = document.getElementById('show-footer');
    document.getElementById('hide-footer')?.addEventListener('click', function () {
      footer.classList.add('hidden');
      if (showFooterBtn) showFooterBtn.style.display = 'inline-flex';
    });
    showFooterBtn?.addEventListener('click', function () {
      footer.classList.remove('hidden');
      showFooterBtn.style.display = 'none';
    });

    initFeedback();
    initWeatherSearch();

    // Manage Data buttons
    document.getElementById('view-catches-btn')?.addEventListener('click', function () { win.openCatchLogModal(''); });
    document.getElementById('export-catches')?.addEventListener('click', win.exportCatchesCSV);
    document.getElementById('export-data')?.addEventListener('click', function () {
      var data = {
        feedback: JSON.parse(localStorage.getItem('gisfishit_feedback') || '[]'),
        favorites: win.getFavorites(),
        settings: win.getSettings()
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'gisfishit-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      win.showToast('Data diekspor', 'success');
    });

    // FIX #25: Validated JSON Import
    document.getElementById('import-data')?.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var parsed = JSON.parse(reader.result);
            if (!parsed || typeof parsed !== 'object') throw new Error('Invalid schema');
            if (Array.isArray(parsed.feedback)) {
              var existing = JSON.parse(localStorage.getItem('gisfishit_feedback') || '[]');
              var validItems = parsed.feedback.filter(function (x) {
                return x && typeof x === 'object' && typeof x.phone === 'string';
              });
              var merged = existing.concat(validItems).slice(-50);
              localStorage.setItem('gisfishit_feedback', JSON.stringify(merged));
            }
            if (Array.isArray(parsed.favorites)) {
              parsed.favorites.forEach(function (f) {
                if (f && typeof f.lat === 'number' && typeof f.lng === 'number' && !win.isFavorite(f.lat, f.lng)) {
                  win.toggleFavorite(f);
                }
              });
            }
            win.showToast('Data berhasil diimpor', 'success');
          } catch (err) {
            win.showToast('Format JSON tidak valid', 'error');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });

    // Back to top
    var backTop = document.getElementById('back-to-top');
    win.addEventListener('scroll', function () {
      if (backTop) backTop.classList.toggle('visible', win.scrollY > 400);
    });
    backTop?.addEventListener('click', function () {
      win.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Animations & UI init
    win.initScrollReveal();
    win.initMagneticButtons();
    win.updateNavIndicator();
    win.addEventListener('resize', win.updateNavIndicator);

    win.animateCountUp(document.getElementById('stat-zones'), 64, '', 0);
    win.animateCountUp(document.getElementById('stat-species'), 40, '', 0);
    win.animateCountUp(document.getElementById('stat-langs'), 6, '', 0);

    // Home Weather Widget + visibility-aware 10-min auto-refresh (FIX #10 & #28)
    win.renderHomeWeatherWidget(-6.2, 106.8, 'Jakarta');
    setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      win.renderHomeWeatherWidget(-6.2, 106.8, 'Jakarta');
      if (document.getElementById('weatherSection').classList.contains('active')) {
        win.renderWeatherTab();
      }
    }, 600000);

    // Support PWA ?tab= shortcut
    var tabParam = new URLSearchParams(win.location.search).get('tab');
    if (tabParam && document.getElementById(tabParam)) {
      switchTab(tabParam);
    }

    // Onboarding Tour on first visit
    setTimeout(function () { win.startOnboardingTour(false); }, 700);
  });

  win.switchTab = switchTab;
  win.applyAutoDarkMode = applyAutoDarkMode;
})(window);
