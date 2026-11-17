/* Storage Module — IndexedDB + localStorage persistence */
(function (win) {
  var safetyDB = null;

  function openSafetyDB() {
    return new Promise(function (resolve, reject) {
      if (safetyDB) return resolve(safetyDB);
      var req = indexedDB.open('gisfishit-safety', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('breadcrumbs')) {
          db.createObjectStore('breadcrumbs', { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('catches')) {
          db.createObjectStore('catches', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function (e) {
        safetyDB = e.target.result;
        resolve(safetyDB);
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  // FIX #12: Use .put() instead of .add()
  async function saveCatch(entry) {
    try {
      var db = await openSafetyDB();
      var record = Object.assign({}, entry, { createdAt: entry.createdAt || Date.now() });
      return await new Promise(function (resolve) {
        var tx = db.transaction('catches', 'readwrite');
        tx.objectStore('catches').put(record);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    } catch (e) {
      win.logger.warn('saveCatch error', e);
      return false;
    }
  }

  async function getAllCatches() {
    try {
      var db = await openSafetyDB();
      return await new Promise(function (resolve) {
        var req = db.transaction('catches', 'readonly').objectStore('catches').getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      });
    } catch (e) {
      return [];
    }
  }

  async function clearCatches() {
    try {
      var db = await openSafetyDB();
      return await new Promise(function (resolve) {
        var tx = db.transaction('catches', 'readwrite');
        tx.objectStore('catches').clear();
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    } catch (e) {
      return false;
    }
  }

  async function saveBreadcrumb(lat, lng) {
    try {
      var db = await openSafetyDB();
      db.transaction('breadcrumbs', 'readwrite').objectStore('breadcrumbs').put({ lat: lat, lng: lng, ts: Date.now() });
    } catch (e) {
      win.logger.warn('saveBreadcrumb error', e);
    }
  }

  async function getAllBreadcrumbs() {
    try {
      var db = await openSafetyDB();
      return await new Promise(function (resolve) {
        var req = db.transaction('breadcrumbs', 'readonly').objectStore('breadcrumbs').getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      });
    } catch (e) {
      return [];
    }
  }

  // FIX #22: Clear breadcrumbs store
  async function clearBreadcrumbs() {
    try {
      var db = await openSafetyDB();
      return await new Promise(function (resolve) {
        var tx = db.transaction('breadcrumbs', 'readwrite');
        tx.objectStore('breadcrumbs').clear();
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    } catch (e) {
      return false;
    }
  }

  function getSettings() {
    try {
      var raw = localStorage.getItem('gisfishit_settings');
      if (!raw) return JSON.parse(JSON.stringify(win.DEFAULT_SETTINGS));
      var parsed = JSON.parse(raw);
      return Object.assign({}, win.DEFAULT_SETTINGS, parsed, {
        boat: Object.assign({}, win.DEFAULT_SETTINGS.boat, parsed.boat || {})
      });
    } catch (e) {
      return JSON.parse(JSON.stringify(win.DEFAULT_SETTINGS));
    }
  }

  function saveSettings(next) {
    localStorage.setItem('gisfishit_settings', JSON.stringify(next));
  }

  // FIX #7: Favorites persistence
  function getFavorites() {
    try {
      var arr = JSON.parse(localStorage.getItem('gisfishit_favorites') || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function isFavorite(lat, lng) {
    return getFavorites().some(function (f) {
      return Math.abs(f.lat - lat) < 0.0001 && Math.abs(f.lng - lng) < 0.0001;
    });
  }

  function toggleFavorite(item) {
    var favs = getFavorites();
    var idx = favs.findIndex(function (f) {
      return Math.abs(f.lat - item.lat) < 0.0001 && Math.abs(f.lng - item.lng) < 0.0001;
    });
    var added = false;
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.push({ lat: item.lat, lng: item.lng, zone: item.zone || 'custom', name: item.name || '' });
      added = true;
    }
    localStorage.setItem('gisfishit_favorites', JSON.stringify(favs));
    return added;
  }

  // FIX #13: Nominatim cache 7 days TTL
  function getNominatimCache(query) {
    try {
      var raw = localStorage.getItem('nominatim_cache_' + query.toLowerCase());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > 7 * 24 * 60 * 60 * 1000) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function setNominatimCache(query, data) {
    try {
      localStorage.setItem('nominatim_cache_' + query.toLowerCase(), JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) { /* quota ignore */ }
  }

  async function clearAllLocalData() {
    localStorage.removeItem('gisfishit_settings');
    localStorage.removeItem('gisfishit_favorites');
    localStorage.removeItem('gisfishit_feedback');
    localStorage.removeItem('gisfishit_tour_done');
    await clearCatches();
    await clearBreadcrumbs();
  }

  win.openSafetyDB = openSafetyDB;
  win.saveCatch = saveCatch;
  win.getAllCatches = getAllCatches;
  win.clearCatches = clearCatches;
  win.saveBreadcrumb = saveBreadcrumb;
  win.getAllBreadcrumbs = getAllBreadcrumbs;
  win.clearBreadcrumbs = clearBreadcrumbs;
  win.getSettings = getSettings;
  win.saveSettings = saveSettings;
  win.getFavorites = getFavorites;
  win.isFavorite = isFavorite;
  win.toggleFavorite = toggleFavorite;
  win.getNominatimCache = getNominatimCache;
  win.setNominatimCache = setNominatimCache;
  win.clearAllLocalData = clearAllLocalData;
})(window);
