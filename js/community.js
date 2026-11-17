/* Community Module — Supabase via window.* globals (FIX #3 & #6) */
(function (win) {
  var SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
  var SUPABASE_ANON_KEY = 'YOUR-ANON-KEY-HERE';

  var supabaseClient = null;
  var communityLayer = null;

  async function initSupabase() {
    if (SUPABASE_URL.indexOf('YOUR-PROJECT') !== -1) return null;
    if (supabaseClient) return supabaseClient;
    try {
      var mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      supabaseClient = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return supabaseClient;
    } catch (e) {
      win.logger.warn('Supabase init failed:', e);
      return null;
    }
  }

  async function loadCommunityReports(mapInstance) {
    var client = supabaseClient || await initSupabase();
    if (!client || !mapInstance) return;
    try {
      var res = await client
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (res.error || !Array.isArray(res.data)) return;
      if (!communityLayer) communityLayer = L.layerGroup().addTo(mapInstance);
      else communityLayer.clearLayers();

      res.data.forEach(function (r) {
        if (r.lat == null || r.lng == null) return;
        L.circleMarker([r.lat, r.lng], {
          radius: 6,
          color: '#D4A574',
          fillColor: '#D4A574',
          fillOpacity: 0.9,
          weight: 2
        })
          .bindPopup(
            '<b>' + (r.species || 'Laporan Komunitas') + '</b><br>' +
            'Berat: ' + (r.weight_kg != null ? r.weight_kg : '—') + ' kg<br>' +
            (r.note ? r.note + '<br>' : '') +
            '<small>' + new Date(r.created_at).toLocaleString('id-ID') + '</small>'
          )
          .addTo(communityLayer);
      });
    } catch (e) {
      win.logger.warn('loadCommunityReports offline:', e);
    }
  }

  async function submitCommunityReport(payload) {
    var client = supabaseClient || await initSupabase();
    if (!client || !navigator.onLine) {
      await win.saveCatch({
        lat: payload.lat,
        lng: payload.lng,
        species: payload.species,
        weight: payload.weight,
        note: payload.note || '',
        synced: false
      });
      return false;
    }
    try {
      var res = await client.from('reports').insert([{
        lat: payload.lat,
        lng: payload.lng,
        species: payload.species,
        weight_kg: payload.weight || null,
        note: payload.note || ''
      }]);
      await win.saveCatch({
        lat: payload.lat,
        lng: payload.lng,
        species: payload.species,
        weight: payload.weight,
        note: payload.note || '',
        synced: !res.error
      });
      return !res.error;
    } catch (e) {
      await win.saveCatch({
        lat: payload.lat,
        lng: payload.lng,
        species: payload.species,
        weight: payload.weight,
        note: payload.note || '',
        synced: false
      });
      return false;
    }
  }

  win.initSupabase = initSupabase;
  win.loadCommunityReports = loadCommunityReports;
  win.submitCommunityReport = submitCommunityReport;
})(window);
