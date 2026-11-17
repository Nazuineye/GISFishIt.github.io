/* GISFishIt v4 — Global Config, BMKG-Compliant Thresholds, API Endpoints, Cache TTL & Custom 24x24 SVGs */
window.lang = 'en';

// BMKG-compliant maritime safety thresholds
window.SAFETY_THRESHOLDS = {
  wave: {
    safe: 0.5,      // m — di bawah 0.5m kondisi relatif tenang
    caution: 1.25,  // m — BMKG: perahu kecil berisiko tinggi (> 1.25m)
    danger: 2.0     // m — sangat berbahaya bagi kapal nelayan tradisional
  },
  wind: {
    safe: 20,       // km/h (~10.8 knot)
    caution: 27.8,  // km/h (15 knot) — ambang BMKG risiko tinggi perahu kecil
    danger: 37      // km/h (~20 knot)
  },
  wavePeriod: {
    safe: 6,        // detik — < 6s periode pendek / ombak curam
    caution: 10,
    danger: 14
  }
};

window.API_CONFIG = {
  openMeteo: {
    marine: 'https://marine-api.open-meteo.com/v1/marine',
    weather: 'https://api.open-meteo.com/v1/forecast'
  },
  bmkg: 'https://peta-maritim.bmkg.go.id/public_api/perairan',
  bmkgNowcast: 'https://www.bmkg.go.id/alerts/nowcast/id/rss.xml',
  ndbc: 'https://www.ndbc.noaa.gov/data/realtime2',
  openWaters: 'https://api.openwaters.io/tides',
  tideCheck: 'https://api.tidecheck.com/v1/tides',
  tideCheckKey: '',
  beachDay: 'https://api.beachday.io/v1/beaches/nearby',
  beachDayKey: ''
};

window.CACHE_TTL = {
  openMeteo: 3600000,  // 1 jam
  bmkg: 1800000,       // 30 menit
  ndbc: 900000,        // 15 menit (observasi real-time buoy)
  tide: 21600000,      // 6 jam
  beach: 86400000      // 24 jam
};

// Stasiun buoy NOAA NDBC terdekat kawasan Asia-Pasifik & Global untuk verifikasi observasi fisik
window.NDBC_STATIONS = [
  { id: '23001', name: 'Indian Ocean Tsunami Buoy', lat: 5.0, lng: 89.0 },
  { id: '52002', name: 'Western Tropical Pacific', lat: 0.0, lng: 147.0 },
  { id: '52003', name: 'Micronesia Equator Buoy', lat: -5.0, lng: 156.0 },
  { id: '21413', name: 'Southeast Japan Buoy', lat: 30.5, lng: 152.1 },
  { id: '51001', name: 'NW Hawaii Buoy', lat: 24.4, lng: -162.0 },
  { id: '42001', name: 'Mid Gulf of Mexico', lat: 25.9, lng: -89.6 },
  { id: '41046', name: 'East Bahamas', lat: 23.8, lng: -68.3 },
  { id: '62107', name: 'Sevenstones Lightship', lat: 50.1, lng: -6.1 }
];

window.DEFAULT_SETTINGS = {
  contacts: [
    { name: 'Pos SAR / Keluarga', phone: '6281234567890' }
  ],
  primaryContactIndex: 0,
  boat: {
    name: 'KM Bahari',
    sizeMeters: 9,
    capacity: 4,
    speedKmh: 10,
    fuelLph: 4.5
  },
  windUnit: 'knot', // Default knot untuk nelayan Indonesia
  notificationsEnabled: false,
  autoDarkMode: true
};

// Simulasi zona edukasi (berdasarkan kondisi BMKG: <= 0.5m tenang, <= 1.25m waspada, > 1.25m terlarang perahu kecil)
window.zoneDefs = [
  { key: 'green', color: '#4A7C59', label: 'Safe', criteria: 'Wave ≤ 0.5 m & Wind ≤ 10.8 knot' },
  { key: 'yellow', color: '#D4A574', label: 'Caution', criteria: 'Wave 0.5–1.25 m or Wind 11–15 knot' },
  { key: 'red', color: '#E86A5F', label: 'Restricted', criteria: 'BMKG Small Boat Risk (> 1.25 m / > 15 knot)' }
];

window.coastalRegions = [
  { name: 'Indonesia', latMin: -11, latMax: 10, lngMin: 95, lngMax: 141 },
  { name: 'Caribbean', latMin: 9, latMax: 28, lngMin: -89, lngMax: -60 },
  { name: 'Mediterranean', latMin: 30, latMax: 46, lngMin: -6, lngMax: 36 },
  { name: 'North Sea', latMin: 50, latMax: 65, lngMin: -4, lngMax: 20 },
  { name: 'Japan', latMin: 33, latMax: 51, lngMin: 127, lngMax: 142 },
  { name: 'Gulf of Mexico', latMin: 18, latMax: 31, lngMin: -98, lngMax: -81 },
  { name: 'Bay of Bengal', latMin: 5, latMax: 22, lngMin: 80, lngMax: 95 },
  { name: 'Coral Triangle', latMin: -10, latMax: 10, lngMin: 125, lngMax: 150 }
];

// 20 Custom SVG Line-Art Icons (stroke 1.5px, 24x24)
window.SVG_ICONS = {
  anchor: '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M5 13a7 7 0 0 0 14 0M5 13H3m18 0h-2M8 10h8"/>',
  compass: '<circle cx="12" cy="12" r="9"/><polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5"/>',
  wave: '<path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  wind: '<path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h8a2 2 0 1 1-2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  fish: '<path d="M3 12c3.5-4.5 9-5.5 14-2.5L21 7v10l-4-2.5C12 17.5 6.5 16.5 3 12Z"/><circle cx="7.5" cy="11.5" r="0.8"/>',
  ship: '<path d="M4 17l2 3h12l2-3M3 14l9-3 9 3-1 3H4l-1-3Zm9-3V4m0 0l5 3-5 2"/>',
  'map-pin': '<path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z"/><circle cx="12" cy="11" r="2.2"/>',
  'alert-triangle': '<path d="M10.3 4.3L2.6 18a1.8 1.8 0 0 0 1.6 2.7h15.6a1.8 1.8 0 0 0 1.6-2.7L13.7 4.3a2 2 0 0 0-3.4 0ZM12 9.5v4.5m0 3h.01"/>',
  sos: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12h7M12 8.5v7"/>',
  gps: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="7.5"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4.2 4.2 0 0 1 7-3.1A4.2 4.2 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.3 10.8l7.4-4.6m-7.4 7l7.4 4.6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2m0 15v2m6.7-15.2l-1.4 1.4M6.7 17.3l-1.4 1.4M21.5 12h-2m-15 0h-2m15.2 6.7l-1.4-1.4M6.7 6.7L5.3 5.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>'
};

window.renderIcon = function (name, size, extraClass) {
  size = size || 20;
  var paths = window.SVG_ICONS[name] || window.SVG_ICONS.anchor;
  return '<svg class="ui-svg ' + (extraClass || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
};

// 5 Generic Fish Category SVG Illustrations
window.FISH_SVGS = {
  tuna: '<svg viewBox="0 0 96 64" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 32c14-14 38-16 56-4l16-10-4 14 4 14-16-10c-18 12-42 10-56-4Z" fill="rgba(44,122,140,0.12)"/><path d="M40 19l6-9 8 10M38 44l4 8 6-6"/><circle cx="24" cy="29" r="2" fill="currentColor"/><path d="M34 26v12"/></svg>',
  reef: '<svg viewBox="0 0 96 64" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 32c12-17 34-18 50-3l16-9v24l-16-9c-16 15-38 14-50-3Z" fill="rgba(139,111,71,0.14)"/><path d="M28 19l14-7 16 7M40 22v20M50 23v18"/><circle cx="24" cy="30" r="2" fill="currentColor"/></svg>',
  catfish: '<svg viewBox="0 0 96 64" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M16 32c14-10 38-9 52-1l14-6-2 14-12-3c-14 9-38 10-52-4Z" fill="rgba(74,124,89,0.14)"/><path d="M16 34l-10 6M16 32l-11 0M16 30l-9-5M42 22l4-8 6 8"/><circle cx="25" cy="29" r="1.8" fill="currentColor"/></svg>',
  crustacean: '<svg viewBox="0 0 96 64" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><ellipse cx="48" cy="36" rx="18" ry="12" fill="rgba(232,106,95,0.15)"/><path d="M34 28l-10-10c-4 2-6 7-2 10l6-3M62 28l10-10c4 2 6 7 2 10l-6-3M30 40l-10 6M34 44l-8 9M66 40l10 6M62 44l8 9"/><circle cx="42" cy="26" r="1.5" fill="currentColor"/><circle cx="54" cy="26" r="1.5" fill="currentColor"/></svg>',
  mollusk: '<svg viewBox="0 0 96 64" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 32l24-11 24 11-24 11-24-11Z" fill="rgba(212,165,116,0.18)"/><path d="M68 32c8-5 15-4 18-1M68 32c9 0 16 1 18 4M68 32c8 6 14 7 16 9"/><circle cx="58" cy="29" r="1.8" fill="currentColor"/></svg>'
};
