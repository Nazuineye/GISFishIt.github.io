/* Community Module — Supabase
   ⚠️ GANTI dua nilai di bawah dengan kredensial proyek Supabase Anda.
   Cara: https://supabase.com → New Project → Settings → API */
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY-HERE';

let supabaseClient = null;
let communityLayer = null;

async function initSupabase() {
  if (SUPABASE_URL.includes('YOUR-PROJECT')) return null; // belum disetup
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  } catch (e) { return null; }
}

async function loadCommunityReports(map) {
  const client = supabaseClient || await initSupabase();
  if (!client) return;
  try {
    const { data, error } = await client.from('reports').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) return;
    if (!communityLayer) communityLayer = L.layerGroup().addTo(map);
    data.forEach(r => {
      if (r.lat == null || r.lng == null) return;
      L.circleMarker([r.lat, r.lng], { radius: 6, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: .8, weight: 2 })
        .bindPopup(`<b>${r.species || 'Laporan'}</b><br>Berat: ${r.weight_kg || '—'} kg<br>${r.note || ''}<br><small>${new Date(r.created_at).toLocaleString()}</small>`)
        .addTo(communityLayer);
    });
  } catch (e) { /* offline */ }
}

async function submitCommunityReport({ lat, lng, species, weight, note }) {
  const client = supabaseClient || await initSupabase();
  if (!client) {
    await saveCatch({ lat, lng, species, weight, note, synced: false });
    return;
  }
  const { error } = await client.from('reports').insert([{ lat, lng, species, weight_kg: weight || null, note }]);
  if (error) showToast('Gagal kirim: ' + error.message, 'error');
  else showToast('Laporan komunitas terkirim', 'success');
}
