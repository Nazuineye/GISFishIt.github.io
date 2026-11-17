/* Weather Orchestrator v4 — Open-Meteo Marine & Weather + BMKG + NOAA NDBC + TideCheck/OpenWaters + SunCalc + IndexedDB Cache */
(function (win) {
  var weatherDB = null;
  var weatherChartInstance = null;
  var chartJsPromise = null;
  var lastWeatherData = null;

  function openWeatherDB() {
    return new Promise(function (resolve, reject) {
      if (weatherDB) return resolve(weatherDB);
      if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
      var req = indexedDB.open('gisfishit-weather', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('marine_data')) {
          db.createObjectStore('marine_data', { keyPath: 'key' });
        }
      };
      req.onsuccess = function (e) {
        weatherDB = e.target.result;
        resolve(weatherDB);
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function getWeatherCache(key, ttlMs) {
    try {
      var db = await openWeatherDB();
      var record = await new Promise(function (resolve) {
        var req = db.transaction('marine_data', 'readonly').objectStore('marine_data').get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
      if (!record || !record.fetchedAt) return null;
      if (Date.now() - record.fetchedAt >= ttlMs) return null;
      return record.data;
    } catch (e) {
      return null;
    }
  }

  async function setWeatherCache(key, data) {
    try {
      var db = await openWeatherDB();
      await new Promise(function (resolve) {
        var tx = db.transaction('marine_data', 'readwrite');
        tx.objectStore('marine_data').put({ key: key, fetchedAt: Date.now(), data: data });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    } catch (e) {
      win.logger.warn('setWeatherCache error:', e);
    }
  }

  async function fetchWithRetry(url, options, maxRetries) {
    maxRetries = maxRetries != null ? maxRetries : 3;
    var delay = 1000;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6500) : null;
      try {
        var opts = Object.assign({}, options || {});
        if (ctrl) opts.signal = ctrl.signal;
        var res = await fetch(url, opts);
        if (timer) clearTimeout(timer);
        if (!res.ok) {
          if (res.status >= 400 && res.status < 500) throw new Error('HTTP ' + res.status);
          throw new Error('HTTP ' + res.status);
        }
        return res;
      } catch (err) {
        if (timer) clearTimeout(timer);
        if (attempt >= maxRetries || (err && /^HTTP 4\d\d$/.test(err.message))) {
          throw err;
        }
        await new Promise(function (r) { setTimeout(r, delay); });
        delay *= 2;
      }
    }
  }

  function knotToKmh(knot) {
    return knot == null ? null : Number(knot) * 1.852;
  }

  function kmhToKnot(kmh) {
    return kmh == null ? null : Number(kmh) / 1.852;
  }

  function getPreferredWindUnit() {
    var sel = document.getElementById('forecast-unit-toggle');
    if (sel && sel.value) return sel.value;
    var s = win.getSettings ? win.getSettings() : {};
    return s.windUnit || 'knot';
  }

  function formatWindDual(kmh, decimals) {
    if (kmh == null || Number.isNaN(Number(kmh))) return '—';
    decimals = decimals != null ? decimals : 0;
    var valKmh = Number(kmh);
    var valKnot = kmhToKnot(valKmh);
    if (getPreferredWindUnit() === 'kmh') {
      return valKmh.toFixed(decimals) + ' km/h (' + valKnot.toFixed(decimals) + ' knot)';
    }
    return valKnot.toFixed(decimals) + ' knot (' + valKmh.toFixed(decimals) + ' km/h)';
  }

  function degToCardinal(deg) {
    if (deg == null || Number.isNaN(Number(deg))) return '—';
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(Number(deg) / 45) % 8];
  }

  // 1. Open-Meteo Marine API (tanpa visibility, tanpa sunrise/sunset)
  async function fetchOpenMeteoMarine(lat, lng) {
    var cacheKey = 'om_marine:' + lat.toFixed(2) + ',' + lng.toFixed(2);
    var cached = await getWeatherCache(cacheKey, win.CACHE_TTL.openMeteo);
    if (cached) return cached;

    var url =
      win.API_CONFIG.openMeteo.marine +
      '?latitude=' + lat + '&longitude=' + lng +
      '&current=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height,wind_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl' +
      '&hourly=wave_height,sea_surface_temperature' +
      '&daily=wave_height_max' +
      '&forecast_days=5&timezone=auto';

    var res = await fetchWithRetry(url);
    var data = await res.json();
    await setWeatherCache(cacheKey, data);
    return data;
  }

  // 2. Open-Meteo Weather API (wind, visibility, sunrise, sunset, pressure)
  async function fetchOpenMeteoWeather(lat, lng) {
    var cacheKey = 'om_weather:' + lat.toFixed(2) + ',' + lng.toFixed(2);
    var cached = await getWeatherCache(cacheKey, win.CACHE_TTL.openMeteo);
    if (cached) return cached;

    var url =
      win.API_CONFIG.openMeteo.weather +
      '?latitude=' + lat + '&longitude=' + lng +
      '&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,apparent_temperature,pressure_msl,cloud_cover,visibility,precipitation_probability' +
      '&hourly=wind_speed_10m,temperature_2m,visibility' +
      '&daily=sunrise,sunset' +
      '&forecast_days=5&timezone=auto';

    var res = await fetchWithRetry(url);
    var data = await res.json();
    await setWeatherCache(cacheKey, data);
    return data;
  }

  // 3. BMKG Maritime Weather API (Otoritatif Indonesia — fallback / pelengkap)
  async function fetchBMKGMarine(lat, lng) {
    // Wilayah perairan Indonesia
    if (lat < -15 || lat > 10 || lng < 90 || lng > 145) return null;
    var cacheKey = 'bmkg:' + lat.toFixed(1) + ',' + lng.toFixed(1);
    var cached = await getWeatherCache(cacheKey, win.CACHE_TTL.bmkg);
    if (cached) return cached;

    try {
      var res = await fetchWithRetry(win.API_CONFIG.bmkg, {}, 1);
      var json = await res.json();
      var list = Array.isArray(json) ? json : (json.features || json.data || []);
      if (!list.length) return null;

      // Cari fitur perairan terdekat berdasarkan centroid/properti jika ada, fallback item pertama
      var match = list[0];
      var bestDist = Infinity;
      list.forEach(function (item) {
        var props = item.properties || item;
        var pLat = parseFloat(props.lat || props.latitude);
        var pLng = parseFloat(props.lon || props.lng || props.longitude);
        if (!Number.isNaN(pLat) && !Number.isNaN(pLng) && win.calcDistanceKm) {
          var d = win.calcDistanceKm(lat, lng, pLat, pLng);
          if (d < bestDist) {
            bestDist = d;
            match = item;
          }
        }
      });

      var p = match.properties || match;
      var parsed = {
        regionName: p.wilayah || p.name || p.perairan || 'Perairan Indonesia',
        windMin: p.wind_speed_min != null ? Number(p.wind_speed_min) : null,
        windMax: p.wind_speed_max != null ? Number(p.wind_speed_max) : null,
        waveCategory: p.wave_cat || p.kategori_gelombang || null,
        waveDesc: p.wave_desc || p.tinggi_gelombang || null,
        warnings: p.warning_desc || p.peringatan || p.weather_desc || null,
        source: 'BMKG'
      };
      await setWeatherCache(cacheKey, parsed);
      return parsed;
    } catch (e) {
      win.logger.warn('BMKG fetch skipped:', e);
      return null;
    }
  }

  // 4. NOAA NDBC Real-Time Buoy Observations
  async function fetchNDBCBuoy(lat, lng) {
    if (!win.NDBC_STATIONS || !win.calcDistanceKm) return null;
    var nearest = null;
    var minDist = Infinity;
    win.NDBC_STATIONS.forEach(function (st) {
      var d = win.calcDistanceKm(lat, lng, st.lat, st.lng);
      if (d < minDist) {
        minDist = d;
        nearest = st;
      }
    });
    if (!nearest || minDist > 1500) return null;

    var cacheKey = 'ndbc:' + nearest.id;
    var cached = await getWeatherCache(cacheKey, win.CACHE_TTL.ndbc);
    if (cached) return cached;

    try {
      var res = await fetchWithRetry(win.API_CONFIG.ndbc + '/' + nearest.id + '.txt', {}, 1);
      var txt = await res.text();
      var lines = txt.split('\n').filter(function (l) { return l.trim() && !l.startsWith('#'); });
      if (!lines.length) return null;
      var cols = lines[0].trim().split(/\s+/);
      var numOrNull = function (v) { return (!v || v === 'MM') ? null : parseFloat(v); };
      var obs = {
        stationId: nearest.id,
        stationName: nearest.name,
        distanceKm: Math.round(minDist),
        obsTime: cols.slice(0, 5).join('-'),
        windDir: numOrNull(cols[5]),
        windSpeedKmh: cols[6] && cols[6] !== 'MM' ? Number(cols[6]) * 3.6 : null,
        waveHeight: numOrNull(cols[8]),
        pressure: numOrNull(cols[12]),
        airTemp: numOrNull(cols[13]),
        seaTemp: numOrNull(cols[14]),
        source: 'NOAA NDBC'
      };
      await setWeatherCache(cacheKey, obs);
      return obs;
    } catch (e) {
      win.logger.warn('NDBC fetch skipped:', e);
      return null;
    }
  }

  // 5. TideCheck API / Open Waters Tides API (Tide Lokal chart datum)
  async function fetchTideCheck(lat, lng) {
    var cacheKey = 'tide:' + lat.toFixed(2) + ',' + lng.toFixed(2);
    var cached = await getWeatherCache(cacheKey, win.CACHE_TTL.tide);
    if (cached) return cached;

    try {
      var url = win.API_CONFIG.tideCheckKey
        ? (win.API_CONFIG.tideCheck + '?lat=' + lat + '&lon=' + lng + '&key=' + encodeURIComponent(win.API_CONFIG.tideCheckKey))
        : (win.API_CONFIG.openWaters + '/stations/nearest?lat=' + lat + '&lon=' + lng);
      var res = await fetchWithRetry(url, {}, 1);
      var data = await res.json();
      if (!data) return null;
      var extremes = data.extremes || data.tides || [];
      var high = extremes.find(function (t) { return /high/i.test(t.type || t.state); });
      var low = extremes.find(function (t) { return /low/i.test(t.type || t.state); });
      var parsed = {
        nextHigh: high ? { time: high.time || high.date, height: high.height } : null,
        nextLow: low ? { time: low.time || low.date, height: low.height } : null,
        tideChart: extremes.slice(0, 8),
        datum: data.datum || 'LAT/Chart Datum',
        source: win.API_CONFIG.tideCheckKey ? 'TideCheck' : 'OpenWaters'
      };
      await setWeatherCache(cacheKey, parsed);
      return parsed;
    } catch (e) {
      win.logger.warn('Tide API skipped:', e);
      return null;
    }
  }

  // 6. Beach Day API (Kualitas air & skor pantai opsional — 24h cache)
  async function fetchBeachDay(lat, lng) {
    if (!win.API_CONFIG.beachDayKey) return null;
    var cacheKey = 'beach:' + lat.toFixed(2) + ',' + lng.toFixed(2);
    var cached = await getWeatherCache(cacheKey, win.CACHE_TTL.beach);
    if (cached) return cached;

    try {
      var res = await fetchWithRetry(
        win.API_CONFIG.beachDay + '?lat=' + lat + '&lng=' + lng,
        { headers: { 'Authorization': 'Bearer ' + win.API_CONFIG.beachDayKey } },
        1
      );
      var data = await res.json();
      var top = (data.beaches && data.beaches[0]) || data;
      var parsed = {
        name: top.name || null,
        waterQuality: top.water_quality_grade || top.waterQuality || null,
        score: top.beach_day_score != null ? top.beach_day_score : null,
        source: 'BeachDay'
      };
      await setWeatherCache(cacheKey, parsed);
      return parsed;
    } catch (e) {
      win.logger.warn('BeachDay skipped:', e);
      return null;
    }
  }

  // Parse kategori gelombang teks BMKG menjadi estimasi angka m bila Open-Meteo tidak ada
  function parseBmkgWaveMeters(desc) {
    if (!desc) return null;
    var matches = String(desc).match(/\d+(\.\d+)?/g);
    if (!matches || !matches.length) return null;
    return parseFloat(matches[matches.length - 1]);
  }

  // ORCHESTRATOR: Promise.allSettled + Merge Priority
  async function fetchAllMarineData(lat, lng) {
    win.startProgress();
    var results = await Promise.allSettled([
      fetchOpenMeteoMarine(lat, lng),
      fetchOpenMeteoWeather(lat, lng),
      fetchBMKGMarine(lat, lng),
      fetchNDBCBuoy(lat, lng),
      fetchTideCheck(lat, lng),
      fetchBeachDay(lat, lng)
    ]);

    var marine = results[0].status === 'fulfilled' ? results[0].value : null;
    var weather = results[1].status === 'fulfilled' ? results[1].value : null;
    var bmkg = results[2].status === 'fulfilled' ? results[2].value : null;
    var ndbc = results[3].status === 'fulfilled' ? results[3].value : null;
    var tide = results[4].status === 'fulfilled' ? results[4].value : null;
    var beach = results[5].status === 'fulfilled' ? results[5].value : null;

    win.finishProgress();

    if (!marine && !weather && !bmkg && !ndbc) {
      return lastWeatherData && (Date.now() - new Date(lastWeatherData.fetchedAt).getTime() < win.CACHE_TTL.openMeteo)
        ? lastWeatherData
        : null;
    }

    var mc = (marine && marine.current) || {};
    var wc = (weather && weather.current) || {};
    var mh = (marine && marine.hourly) || {};
    var wh = (weather && weather.hourly) || {};
    var md = (marine && marine.daily) || {};
    var wd = (weather && weather.daily) || {};

    var bmkgWaveEst = bmkg ? parseBmkgWaveMeters(bmkg.waveDesc) : null;
    var bmkgWindKmhEst = bmkg && bmkg.windMax != null ? knotToKmh(bmkg.windMax) : null;

    var waveHeight = mc.wave_height != null ? mc.wave_height : (bmkgWaveEst != null ? bmkgWaveEst : (ndbc ? ndbc.waveHeight : null));
    var windSpeed = wc.wind_speed_10m != null ? wc.wind_speed_10m : (bmkgWindKmhEst != null ? bmkgWindKmhEst : (ndbc ? ndbc.windSpeedKmh : null));
    var visibility = wc.visibility != null ? wc.visibility : null;
    var currentVel = mc.ocean_current_velocity != null ? mc.ocean_current_velocity : null;
    var currentDir = mc.ocean_current_direction != null ? mc.ocean_current_direction : null;
    var seaTemp = mc.sea_surface_temperature != null ? mc.sea_surface_temperature : (ndbc ? ndbc.seaTemp : null);

    var hourlyTime = mh.time || wh.time || [];
    var hourlyWave = mh.wave_height || [];
    var hourlySeaTemp = mh.sea_surface_temperature || [];
    var hourlyWind = wh.wind_speed_10m || [];
    var next24h = [];
    for (var i = 0; i < Math.min(24, hourlyTime.length); i++) {
      next24h.push({
        time: hourlyTime[i],
        waveHeight: hourlyWave[i] != null ? hourlyWave[i] : null,
        windSpeed: hourlyWind[i] != null ? hourlyWind[i] : null
      });
    }

    var sources = [];
    if (marine || weather) sources.push('Open-Meteo');
    if (bmkg) sources.push('BMKG');
    if (ndbc) sources.push('NOAA Buoy #' + ndbc.stationId);
    if (tide) sources.push(tide.source);
    if (beach) sources.push('BeachDay');

    var merged = {
      lat: lat,
      lng: lng,
      current: {
        waveHeight: waveHeight,
        waveDirection: mc.wave_direction != null ? mc.wave_direction : null,
        wavePeriod: mc.wave_period != null ? mc.wave_period : null,
        waveHeightMaxDaily: (md.wave_height_max && md.wave_height_max[0] != null) ? md.wave_height_max[0] : null,
        swellHeight: mc.swell_wave_height != null ? mc.swell_wave_height : null,
        seaTemp: seaTemp,
        oceanCurrentVelocity: currentVel,
        oceanCurrentDirection: currentDir,
        seaLevelMsl: mc.sea_level_height_msl != null ? mc.sea_level_height_msl : null,
        windSpeed: windSpeed,
        windGust: wc.wind_gusts_10m != null ? wc.wind_gusts_10m : null,
        windDirection: wc.wind_direction_10m != null ? wc.wind_direction_10m : (ndbc ? ndbc.windDir : null),
        visibility: visibility,
        airTemp: wc.temperature_2m != null ? wc.temperature_2m : (ndbc ? ndbc.airTemp : null),
        pressureMsl: wc.pressure_msl != null ? wc.pressure_msl : (ndbc ? ndbc.pressure : null),
        cloudCover: wc.cloud_cover != null ? wc.cloud_cover : null
      },
      // Flat aliases for backward compatibility with existing callers
      waveHeight: waveHeight,
      windSpeed: windSpeed,
      seaTemp: seaTemp,
      visibility: visibility,
      airTemp: wc.temperature_2m != null ? wc.temperature_2m : null,
      cloudCover: wc.cloud_cover != null ? wc.cloud_cover : null,
      wavePeriod: mc.wave_period != null ? mc.wave_period : null,
      windGust: wc.wind_gusts_10m != null ? wc.wind_gusts_10m : null,
      windDirection: wc.wind_direction_10m != null ? wc.wind_direction_10m : null,
      sunrise: (wd.sunrise && wd.sunrise[0]) || null,
      sunset: (wd.sunset && wd.sunset[0]) || null,
      next24h: next24h,
      hourly: {
        time: hourlyTime,
        waveHeight: hourlyWave,
        seaTemp: hourlySeaTemp,
        windSpeed: hourlyWind
      },
      bmkg: bmkg,
      ndbc: ndbc,
      tide: tide,
      beach: beach,
      sources: sources,
      fieldSources: {
        wave: mc.wave_height != null ? 'Open-Meteo' : (bmkgWaveEst != null ? 'BMKG' : (ndbc ? 'NDBC' : null)),
        wind: wc.wind_speed_10m != null ? 'Open-Meteo' : (bmkgWindKmhEst != null ? 'BMKG' : (ndbc ? 'NDBC' : null)),
        visibility: wc.visibility != null ? 'Open-Meteo Weather' : null,
        tide: tide ? tide.source : null
      },
      fetchedAt: new Date().toISOString()
    };

    lastWeatherData = merged;
    return merged;
  }

  // LOGIKA SAFETY v4 (BMKG-COMPLIANT + EVALUASI MAX 24 JAM KE DEPAN)
  function assessSafety(marineData) {
    if (!marineData) {
      return {
        level: 'no-data',
        label: win.t('safety_no_data') || 'Data tidak tersedia — cek manual BMKG',
        cls: 'badge-caution',
        reasons: ['Tidak ada data dari Open-Meteo, BMKG, atau buoy.'],
        maxWave24h: null,
        maxWind24h: null
      };
    }

    var current = marineData.current || marineData;
    var next24h = Array.isArray(marineData.next24h) ? marineData.next24h : [];
    var waveCandidates = [];
    var windCandidates = [];

    if (current && current.waveHeight != null) waveCandidates.push(Number(current.waveHeight));
    if (current && current.windSpeed != null) windCandidates.push(Number(current.windSpeed));
    next24h.forEach(function (h) {
      if (h.waveHeight != null) waveCandidates.push(Number(h.waveHeight));
      if (h.windSpeed != null) windCandidates.push(Number(h.windSpeed));
    });

    if (!waveCandidates.length && !windCandidates.length) {
      return {
        level: 'no-data',
        label: win.t('safety_no_data') || 'Data tidak tersedia — cek manual BMKG',
        cls: 'badge-caution',
        reasons: ['Parameter gelombang & angin tidak tersedia.'],
        maxWave24h: null,
        maxWind24h: null
      };
    }

    var maxWave24h = waveCandidates.length ? Math.max.apply(null, waveCandidates) : 0;
    var maxWind24h = windCandidates.length ? Math.max.apply(null, windCandidates) : 0;
    var th = win.SAFETY_THRESHOLDS;
    var reasons = [];
    var level = 'safe';

    if (maxWave24h >= th.wave.danger || maxWind24h >= th.wind.danger) {
      level = 'danger';
      reasons.push(
        'Max 24 jam: gelombang ' + maxWave24h.toFixed(1) + ' m / angin ' +
        kmhToKnot(maxWind24h).toFixed(0) + ' knot (' + maxWind24h.toFixed(0) + ' km/h)'
      );
      reasons.push('BMKG: melebihi batas aman pelayaran perahu kecil (> 1.25 m / > 15 knot)');
    } else if (maxWave24h >= th.wave.caution || maxWind24h >= th.wind.caution) {
      level = 'caution';
      reasons.push('Max 24 jam: ' + maxWave24h.toFixed(1) + ' m / ' + kmhToKnot(maxWind24h).toFixed(0) + ' knot');
      reasons.push('BMKG: perahu kecil berisiko tinggi jika angin >15 knot (27.8 km/h) atau gelombang >1.25 m');
    } else if (maxWave24h > th.wave.safe || maxWind24h > th.wind.safe) {
      level = 'caution';
      reasons.push('Potensi gelombang sedang (>0.5 m) atau angin >10.8 knot dalam 24 jam ke depan');
    }

    if (current && current.wavePeriod != null && current.wavePeriod < th.wavePeriod.safe && maxWave24h >= th.wave.safe) {
      reasons.push('Periode gelombang pendek (' + current.wavePeriod.toFixed(0) + ' s) — ombak cenderung curam');
    }

    if (marineData.bmkg && marineData.bmkg.warnings) {
      reasons.push('BMKG (' + marineData.bmkg.regionName + '): ' + marineData.bmkg.warnings);
    }

    var labels = {
      safe: win.t('forecast_safe') || 'AMAN — Gelombang & angin dalam batas aman',
      caution: win.t('forecast_caution') || 'HATI-HATI — Potensi gelombang/angin meningkat 24 jam ke depan',
      danger: win.t('forecast_danger') || 'BERBAHAYA — Jangan melaut. Melebihi batas aman perahu kecil'
    };

    var result = {
      level: level,
      label: labels[level],
      cls: 'badge-' + level,
      reasons: reasons,
      maxWave24h: maxWave24h,
      maxWind24h: maxWind24h
    };

    if (level === 'danger' && typeof win.checkWeatherAlert === 'function') {
      win.checkWeatherAlert(result, marineData);
    }
    return result;
  }

  // Moon phase via SunCalc (akurasi astronomis penuh) + Julian Day fallback
  function getMoonPhase(date) {
    date = date || new Date();
    var phaseRatio = 0;
    var illum = 0;
    if (win.SunCalc && typeof win.SunCalc.getMoonIllumination === 'function') {
      var sc = win.SunCalc.getMoonIllumination(date);
      phaseRatio = sc.phase;
      illum = Math.round(sc.fraction * 100);
    } else {
      var lp = 29.53058867;
      var jd = (date.getTime() / 86400000) + 2440587.5;
      var daysSinceNew = (jd - 2451550.1) % lp;
      if (daysSinceNew < 0) daysSinceNew += lp;
      phaseRatio = daysSinceNew / lp;
      illum = Math.round(((1 - Math.cos(phaseRatio * 2 * Math.PI)) / 2) * 100);
    }
    var idx = Math.floor(phaseRatio * 8) % 8;
    var names = [
      'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
      'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'
    ];
    return {
      index: idx,
      phase: names[idx],
      illumination: illum,
      svg: win.renderMoonSVG(idx)
    };
  }

  function showWeatherSkeletons(ids) {
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<span class="skeleton" aria-hidden="true"></span>';
    });
  }

  function setSourceBadge(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    if (text) {
      el.textContent = text;
      el.style.display = 'inline-block';
    } else {
      el.textContent = '';
      el.style.display = 'none';
    }
  }

  async function updateMapForecastPanel(lat, lng) {
    showWeatherSkeletons([
      'marine-forecast-wave', 'marine-forecast-wind', 'marine-forecast-temp',
      'marine-forecast-visibility', 'marine-forecast-current', 'marine-forecast-tide'
    ]);
    var data = await fetchAllMarineData(lat, lng);
    var waveEl = document.getElementById('marine-forecast-wave');
    var waveMaxEl = document.getElementById('marine-forecast-wave-max');
    var windEl = document.getElementById('marine-forecast-wind');
    var windMaxEl = document.getElementById('marine-forecast-wind-max');
    var tempEl = document.getElementById('marine-forecast-temp');
    var visEl = document.getElementById('marine-forecast-visibility');
    var currEl = document.getElementById('marine-forecast-current');
    var tideEl = document.getElementById('marine-forecast-tide');
    var seaMslEl = document.getElementById('marine-forecast-sea-msl');
    var statusEl = document.getElementById('marine-safety-status');
    var reasonsEl = document.getElementById('marine-safety-reasons');
    var infoEl = document.getElementById('forecast-info');
    var detailsEl = document.getElementById('forecast-details');

    var safety = assessSafety(data);

    if (!data) {
      [waveEl, windEl, tempEl, visEl, currEl, tideEl, seaMslEl, waveMaxEl, windMaxEl].forEach(function (el) {
        if (el) el.textContent = '—';
      });
      if (statusEl) { statusEl.textContent = safety.label; statusEl.className = 'badge ' + safety.cls; }
      if (reasonsEl) reasonsEl.innerHTML = '<li>' + safety.reasons[0] + '</li>';
      if (infoEl) infoEl.textContent = win.t('safety_no_data');
      if (detailsEl) detailsEl.textContent = '';
      win.showToast(win.t('safety_no_data'), 'warning');
      return null;
    }

    var c = data.current;
    if (waveEl) waveEl.textContent = c.waveHeight != null ? c.waveHeight.toFixed(1) + ' m' : '—';
    if (waveMaxEl) waveMaxEl.textContent = safety.maxWave24h != null ? safety.maxWave24h.toFixed(1) + ' m' : '—';
    if (windEl) windEl.textContent = formatWindDual(c.windSpeed, 0);
    if (windMaxEl) windMaxEl.textContent = safety.maxWind24h != null ? formatWindDual(safety.maxWind24h, 0) : '—';
    if (tempEl) tempEl.textContent = c.seaTemp != null ? c.seaTemp.toFixed(1) + '°C' : '—';
    if (visEl) visEl.textContent = c.visibility != null ? (c.visibility / 1000).toFixed(1) + ' km' : '—';

    if (currEl) {
      if (c.oceanCurrentVelocity != null) {
        currEl.textContent = c.oceanCurrentVelocity.toFixed(2) + ' m/s ' + degToCardinal(c.oceanCurrentDirection);
        currEl.title = '';
      } else {
        currEl.textContent = '—';
        currEl.title = win.t('forecast_current_unavailable');
      }
    }

    if (tideEl) {
      if (data.tide && (data.tide.nextHigh || data.tide.nextLow)) {
        var parts = [];
        if (data.tide.nextHigh) parts.push('H ' + String(data.tide.nextHigh.time || '').slice(11, 16) + (data.tide.nextHigh.height != null ? ' (' + data.tide.nextHigh.height + 'm)' : ''));
        if (data.tide.nextLow) parts.push('L ' + String(data.tide.nextLow.time || '').slice(11, 16));
        tideEl.textContent = parts.join(' / ');
      } else {
        tideEl.textContent = '—';
      }
    }

    if (seaMslEl) {
      seaMslEl.textContent = c.seaLevelMsl != null ? (c.seaLevelMsl >= 0 ? '+' : '') + c.seaLevelMsl.toFixed(2) + ' m' : '—';
    }

    setSourceBadge('src-badge-wave', data.fieldSources.wave);
    setSourceBadge('src-badge-wind', data.fieldSources.wind);
    setSourceBadge('src-badge-vis', data.fieldSources.visibility);
    setSourceBadge('src-badge-tide', data.fieldSources.tide);

    if (statusEl) {
      statusEl.textContent = safety.label;
      statusEl.className = 'badge ' + safety.cls;
    }
    if (reasonsEl) {
      reasonsEl.innerHTML = safety.reasons.map(function (r) { return '<li>' + r + '</li>'; }).join('');
    }

    var locale = win.lang === 'id' ? 'id-ID' : 'en-US';
    if (infoEl) infoEl.textContent = 'Sumber: ' + data.sources.join(' + ') + ' • ' + new Date(data.fetchedAt).toLocaleTimeString(locale);
    if (detailsEl) {
      var detailParts = [
        'Period ' + (c.wavePeriod != null ? c.wavePeriod.toFixed(0) : '—') + 's',
        'Gust ' + formatWindDual(c.windGust, 0)
      ];
      if (data.ndbc) detailParts.push('Buoy #' + data.ndbc.stationId + ' (' + data.ndbc.distanceKm + ' km)');
      if (data.beach && data.beach.waterQuality) detailParts.push('Water Grade: ' + data.beach.waterQuality);
      detailsEl.textContent = detailParts.join(' • ');
    }
    return data;
  }

  async function renderHomeWeatherWidget(lat, lng, label) {
    lat = lat != null ? lat : -6.2;
    lng = lng != null ? lng : 106.8;
    label = label || 'Jakarta';
    var tempEl = document.getElementById('home-widget-temp');
    var locEl = document.getElementById('home-widget-loc');
    var badgeEl = document.getElementById('home-widget-badge');
    var iconEl = document.getElementById('home-widget-icon');
    if (!tempEl) return;

    if (locEl) locEl.textContent = label;
    tempEl.innerHTML = '<span class="skeleton"></span>';
    var data = await fetchAllMarineData(lat, lng);
    var safety = assessSafety(data);
    if (!data) {
      tempEl.textContent = '—';
      if (badgeEl) { badgeEl.textContent = safety.label; badgeEl.className = 'badge ' + safety.cls; }
      return;
    }
    if (data.current.airTemp != null) win.animateCountUp(tempEl, data.current.airTemp, '°C', 0); else tempEl.textContent = '—';
    if (badgeEl) { badgeEl.textContent = safety.label; badgeEl.className = 'badge ' + safety.cls; }
    if (iconEl) {
      var kind = (safety.maxWave24h || 0) >= 1.25 ? 'wave' : (data.current.cloudCover || 0) > 55 ? 'cloud' : 'sun';
      iconEl.innerHTML = win.renderWeatherSVG(kind);
    }
  }

  async function renderWeatherTab(lat, lng, locationName) {
    lat = lat != null ? lat : -6.2;
    lng = lng != null ? lng : 106.8;
    locationName = locationName || 'Jakarta';

    var locTitle = document.getElementById('weather-location-name');
    if (locTitle) locTitle.textContent = locationName;
    showWeatherSkeletons([
      'weather-current-temp', 'weather-wind', 'weather-wave', 'weather-visibility',
      'marine-wave-height', 'marine-water-temp', 'marine-wind-speed', 'marine-air-temp', 'marine-wind-gust'
    ]);

    var data = await fetchAllMarineData(lat, lng);
    var safety = assessSafety(data);

    if (!data) {
      ['weather-current-temp', 'weather-humidity', 'weather-wind', 'weather-wave', 'weather-visibility',
        'marine-wave-height', 'marine-wave-max', 'marine-water-temp', 'marine-wind-speed', 'marine-wind-dir',
        'marine-air-temp', 'marine-wind-gust', 'marine-current-el', 'marine-tide-local', 'marine-sea-msl',
        'marine-astro-sunrise', 'marine-astro-sunset']
        .forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.textContent = '—';
        });
      var descEl = document.getElementById('weather-current-desc');
      if (descEl) { descEl.textContent = safety.label; descEl.className = 'badge ' + safety.cls; }
      document.getElementById('forecast-days').innerHTML = '';
      document.getElementById('weather-alert-container').innerHTML = '';
      win.showToast(win.t('safety_no_data'), 'warning');
      return;
    }

    var c = data.current;
    var kind = (safety.maxWave24h || 0) >= 1.25 ? 'wave' : (c.cloudCover || 0) > 55 ? 'cloud' : 'sun';
    document.getElementById('weather-current-icon').innerHTML = win.renderWeatherSVG(kind);
    var descEl = document.getElementById('weather-current-desc');
    descEl.textContent = safety.label;
    descEl.className = 'badge ' + safety.cls;

    var tempEl = document.getElementById('weather-current-temp');
    if (c.airTemp != null) win.animateCountUp(tempEl, c.airTemp, '°C', 0); else tempEl.textContent = '—';

    document.getElementById('weather-humidity').textContent = c.cloudCover != null ? c.cloudCover + '%' : '—';
    document.getElementById('weather-wind').textContent = formatWindDual(c.windSpeed, 0);
    document.getElementById('weather-wave').textContent = c.waveHeight != null ? c.waveHeight.toFixed(1) + ' m (Max 24j: ' + (safety.maxWave24h != null ? safety.maxWave24h.toFixed(1) + 'm' : '—') + ')' : '—';
    document.getElementById('weather-visibility').textContent = c.visibility != null ? (c.visibility / 1000).toFixed(1) + ' km' : '—';

    document.getElementById('marine-wave-height').textContent = c.waveHeight != null ? c.waveHeight.toFixed(1) + ' m' : '—';
    var wMaxEl = document.getElementById('marine-wave-max');
    if (wMaxEl) wMaxEl.textContent = c.waveHeightMaxDaily != null ? c.waveHeightMaxDaily.toFixed(1) + ' m' : (safety.maxWave24h != null ? safety.maxWave24h.toFixed(1) + ' m' : '—');
    document.getElementById('marine-water-temp').textContent = c.seaTemp != null ? c.seaTemp.toFixed(1) + '°C' : '—';
    document.getElementById('marine-wind-speed').textContent = formatWindDual(c.windSpeed, 0);
    document.getElementById('marine-wind-dir').textContent = degToCardinal(c.windDirection);
    document.getElementById('marine-air-temp').textContent = c.airTemp != null ? c.airTemp.toFixed(1) + '°C' : '—';
    document.getElementById('marine-wind-gust').textContent = formatWindDual(c.windGust, 0);

    var currEl = document.getElementById('marine-current-el');
    if (currEl) {
      currEl.textContent = c.oceanCurrentVelocity != null ? c.oceanCurrentVelocity.toFixed(2) + ' m/s ' + degToCardinal(c.oceanCurrentDirection) : '—';
      currEl.title = c.oceanCurrentVelocity == null ? win.t('forecast_current_unavailable') : '';
    }
    var tideLocalEl = document.getElementById('marine-tide-local');
    if (tideLocalEl) {
      if (data.tide && data.tide.nextHigh) {
        tideLocalEl.textContent = 'High ' + String(data.tide.nextHigh.time || '').slice(11, 16) +
          (data.tide.nextHigh.height != null ? ' (' + data.tide.nextHigh.height + 'm)' : '');
      } else {
        tideLocalEl.textContent = '— (Cek stasiun lokal)';
      }
    }
    var seaMslEl = document.getElementById('marine-sea-msl');
    if (seaMslEl) {
      seaMslEl.textContent = c.seaLevelMsl != null ? (c.seaLevelMsl >= 0 ? '+' : '') + c.seaLevelMsl.toFixed(2) + ' m' : '—';
    }

    var sunriseEl = document.getElementById('marine-astro-sunrise');
    var sunsetEl = document.getElementById('marine-astro-sunset');
    if (sunriseEl) sunriseEl.textContent = data.sunrise ? data.sunrise.slice(11, 16) : '—';
    if (sunsetEl) sunsetEl.textContent = data.sunset ? data.sunset.slice(11, 16) : '—';

    var moon = getMoonPhase(new Date());
    var moonEl = document.getElementById('marine-moon-phase');
    if (moonEl) moonEl.innerHTML = moon.svg + ' <span>' + moon.phase + ' (' + moon.illumination + '%)</span>';

    var srcLineEl = document.getElementById('weather-sources-line');
    if (srcLineEl) srcLineEl.textContent = 'Sumber aktif: ' + data.sources.join(' + ');

    // 5-day forecast
    var forecastContainer = document.getElementById('forecast-days');
    if (forecastContainer && data.hourly.time.length) {
      var days = {};
      data.hourly.time.forEach(function (iso, i) {
        var d = iso.slice(0, 10);
        if (!days[d]) days[d] = { temps: [], waves: [] };
        if (data.hourly.seaTemp[i] != null) days[d].temps.push(data.hourly.seaTemp[i]);
        if (data.hourly.waveHeight[i] != null) days[d].waves.push(data.hourly.waveHeight[i]);
      });
      var locale = win.lang === 'id' ? 'id-ID' : 'en-US';
      forecastContainer.innerHTML = Object.entries(days).slice(0, 5).map(function (entry) {
        var day = entry[0];
        var d = entry[1];
        var avgTemp = d.temps.length ? (d.temps.reduce(function (a, b) { return a + b; }, 0) / d.temps.length).toFixed(0) : '—';
        var maxWave = d.waves.length ? Math.max.apply(null, d.waves).toFixed(1) : '—';
        var wNum = parseFloat(maxWave);
        var wKind = !Number.isNaN(wNum) && wNum >= 1.25 ? 'wave' : !Number.isNaN(wNum) && wNum > 0.5 ? 'cloud' : 'sun';
        return '<div class="forecast-day">' +
          '<div class="small"><strong>' + new Date(day).toLocaleDateString(locale, { weekday: 'short' }) + '</strong></div>' +
          '<div style="margin:6px auto;color:var(--sea-mid)">' + win.renderWeatherSVG(wKind) + '</div>' +
          '<div class="num"><strong>' + (avgTemp === '—' ? '—' : avgTemp + '°C') + '</strong><br><span class="small">' + (maxWave === '—' ? '—' : maxWave + ' m') + '</span></div>' +
          '</div>';
      }).join('');
    }

    // Lazy Chart.js
    if (data.hourly.time.length) {
      try {
        await ensureChartJsLoaded();
        var canvas = document.getElementById('weather-chart');
        if (canvas && typeof Chart !== 'undefined') {
          var ctx = canvas.getContext('2d');
          try { if (weatherChartInstance) weatherChartInstance.destroy(); } catch (e) { /* ignore */ }
          weatherChartInstance = null;
          var labels = data.hourly.time.slice(0, 24).map(function (ts) { return ts.slice(11, 16); });
          var windSeries = data.hourly.windSpeed.slice(0, 24).map(function (w) {
            return w == null ? null : (getPreferredWindUnit() === 'knot' ? Number(kmhToKnot(w).toFixed(1)) : w);
          });
          var windUnitLbl = getPreferredWindUnit() === 'knot' ? 'knot' : 'km/h';
          var isDarkChart = document.body.classList.contains('dark');
          var tickColor = isDarkChart ? '#B8CED6' : '#4E5D63';
          var gridColor = isDarkChart ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 32, 39, 0.08)';
          weatherChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [
                {
                  label: 'Wave Hs (m)',
                  data: data.hourly.waveHeight.slice(0, 24),
                  borderColor: '#5BB8CC',
                  backgroundColor: 'rgba(91, 184, 204, 0.16)',
                  fill: true,
                  tension: 0.35,
                  yAxisID: 'y'
                },
                {
                  label: 'Wind (' + windUnitLbl + ')',
                  data: windSeries,
                  borderColor: '#D4A574',
                  backgroundColor: 'rgba(212, 165, 116, 0.14)',
                  fill: true,
                  tension: 0.35,
                  yAxisID: 'y1'
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 800, easing: 'easeOutQuart' },
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: { labels: { color: tickColor } }
              },
              scales: {
                x: { ticks: { color: tickColor }, grid: { color: gridColor } },
                y: { type: 'linear', position: 'left', ticks: { color: tickColor }, grid: { color: gridColor }, title: { display: true, text: 'm', color: tickColor } },
                y1: { type: 'linear', position: 'right', ticks: { color: tickColor }, grid: { drawOnChartArea: false }, title: { display: true, text: windUnitLbl, color: tickColor } }
              }
            }
          });
        }
      } catch (err) {
        win.logger.warn('Chart render failed:', err);
      }
    }

    var alertEl = document.getElementById('weather-alert-container');
    alertEl.innerHTML = '';
    if (safety.level === 'danger' || safety.level === 'caution') {
      var listHtml = safety.reasons.map(function (r) { return '<li>' + r + '</li>'; }).join('');
      alertEl.innerHTML =
        '<div class="weather-alert ' + (safety.level === 'danger' ? 'danger ' : '') + 'shake">' +
        '<div>' + win.renderIcon('alert-triangle', 22) + '</div>' +
        '<div><strong>' + safety.label + '</strong>' + (listHtml ? '<ul class="safety-reasons">' + listHtml + '</ul>' : '') + '</div>' +
        '</div>';
    }
  }

  function ensureChartJsLoaded() {
    if (typeof Chart !== 'undefined') return Promise.resolve();
    if (chartJsPromise) return chartJsPromise;
    chartJsPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function (err) { chartJsPromise = null; reject(err); };
      document.head.appendChild(s);
    });
    return chartJsPromise;
  }

  win.knotToKmh = knotToKmh;
  win.kmhToKnot = kmhToKnot;
  win.formatWindDual = formatWindDual;
  win.degToCardinal = degToCardinal;
  win.fetchOpenMeteoMarine = fetchOpenMeteoMarine;
  win.fetchOpenMeteoWeather = fetchOpenMeteoWeather;
  win.fetchBMKGMarine = fetchBMKGMarine;
  win.fetchNDBCBuoy = fetchNDBCBuoy;
  win.fetchTideCheck = fetchTideCheck;
  win.fetchBeachDay = fetchBeachDay;
  win.fetchAllMarineData = fetchAllMarineData;
  win.fetchMarineWeather = fetchAllMarineData;
  win.assessSafety = assessSafety;
  win.getMoonPhase = getMoonPhase;
  win.updateMapForecastPanel = updateMapForecastPanel;
  win.renderHomeWeatherWidget = renderHomeWeatherWidget;
  win.renderWeatherTab = renderWeatherTab;
})(window);
