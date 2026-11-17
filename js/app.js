/* App orchestrator */
document.addEventListener('DOMContentLoaded', () => {
  // Intro
  const intro = document.getElementById('intro-screen');
  document.getElementById('start-btn').addEventListener('click', () => {
    intro.style.opacity = 0;
    setTimeout(() => { intro.style.display = 'none'; }, 600);
  });

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(target).style.display = 'block';
      btn.classList.add('active');
      if (target === 'mapSection' && map) setTimeout(() => map.invalidateSize(), 100);
      if (target === 'weatherSection') renderWeatherTab();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Feature tabs on home
  document.querySelectorAll('.feature-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.feature-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.feature-content').forEach(c => c.classList.remove('active'));
      document.getElementById(btn.dataset.target)?.classList.add('active');
    });
  });

  // Theme
  document.getElementById('toggle-theme').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    if (!map) return;
    const dark = document.body.classList.contains('dark');
    const darkTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png');
    const esriTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri' });
    map.eachLayer(l => { if (l._url && (l._url.includes('cartocdn') || l._url.includes('arcgisonline'))) map.removeLayer(l); });
    (dark ? darkTile : esriTile).addTo(map);
  });

  // Language
  document.getElementById('lang-select').addEventListener('change', e => {
    lang = e.target.value;
    applyI18n();
    populateFishTables();
  });

  // Map init
  initMap();
  applyI18n();
  populateFishTables();

  // Slideshow
  initBackgroundSlideshow();
  initHomeSlider();

  // Footer
  initFooter();
  initFeedback();

  // Back to top
  const backTop = document.getElementById('back-to-top');
  window.addEventListener('scroll', () => backTop.classList.toggle('visible', window.scrollY > 400));
  backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // Export/Import data
  document.getElementById('export-data').addEventListener('click', () => {
    const data = { feedback: JSON.parse(localStorage.getItem('gisfishit_feedback') || '[]') };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gisfishit-data.json';
    a.click();
    showToast(t('alert_exported'), 'success');
  });
  document.getElementById('import-data').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (data.feedback) localStorage.setItem('gisfishit_feedback', JSON.stringify(data.feedback));
          showToast(t('alert_imported'), 'success');
        } catch { showToast('Invalid file', 'error'); }
      };
      reader.readAsText(file);
    };
    input.click();
  });
  document.getElementById('export-catches').addEventListener('click', exportCatchesCSV);

  // Weather location search
  document.getElementById('weather-location-input').addEventListener('keypress', async (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim();
    if (!q) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
      const data = await res.json();
      if (!data.length) { showToast(t('alert_not_found'), 'warning'); return; }
      renderWeatherTab(parseFloat(data[0].lat), parseFloat(data[0].lon), q);
    } catch { showToast(t('alert
