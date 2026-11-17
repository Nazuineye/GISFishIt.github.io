/* Global State */
let randomizeOn = true;
let lang = 'en';
let weatherChart = null;
let randomizeInterval = null;

/* Zone definitions */
const zoneDefs = [
  { key: 'green', color: 'green', label: 'Safe' },
  { key: 'yellow', color: 'goldenrod', label: 'Caution' },
  { key: 'red', color: 'red', label: 'Restricted' }
];

/* Coastal regions for zone spawn (concentrated areas) */
const coastalRegions = [
  { name: 'Indonesia', latMin: -11, latMax: 10, lngMin: 95, lngMax: 141 },
  { name: 'Caribbean', latMin: 9, latMax: 28, lngMin: -89, lngMax: -60 },
  { name: 'Mediterranean', latMin: 30, latMax: 46, lngMin: -6, lngMax: 36 },
  { name: 'North Sea', latMin: 50, latMax: 65, lngMin: -4, lngMax: 20 },
  { name: 'Japan', latMin: 33, latMax: 51, lngMin: 127, lngMax: 142 },
  { name: 'Gulf of Mexico', latMin: 18, latMax: 31, lngMin: -98, lngMax: -81 },
  { name: 'Bay of Bengal', latMin: 5, latMax: 22, lngMin: 80, lngMax: 95 },
  { name: 'Coral Triangle', latMin: -10, latMax: 10, lngMin: 125, lngMax: 150 }
];

/* Emergency contact (GANTI sesuai kebutuhan) */
const EMERGENCY_PHONE = '6281234567890'; // format internasional tanpa +
