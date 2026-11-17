/* Weather Module — Open-Meteo Marine + Weather API (real, no key) */
let weatherChartInstance = null;
let lastWeatherData = null;

async function fetchMarineWeather(lat, lng) {
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}` +
    `&current=wave_height,wave_direction,wave_period,swell_wave_height,sea_surface_temperature` +
    `&hourly=wave_height,sea_surface_temperature&forecast_days=5&timezone=auto`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,cloud_cover` +
    `&hourly=wind_speed_10m,temperature_2m&forecast_days=5&timezone=auto`;

  try {
    const [marineRes, weatherRes] = await Promise.all([fetch(marineUrl), fetch(weatherUrl)]);
    if (!marineRes.ok || !weatherRes.ok) throw new Error('API error');
    const marine = await marineRes.json();
    const weather = await weatherRes.json();

    lastWeatherData = {
      waveHeight: marine.current?.wave_height ?? null,
      waveDirection: marine.current?.wave_direction ?? null,
      wavePeriod: marine.current?.wave_period ?? null,
      seaTemp: marine.current?.sea_surface_temperature ?? null,
      windSpeed: weather.current?.wind_speed_10m ?? null,
      windGust: weather.current?.wind_gusts_10m ?? null,
      windDirection: weather.current?.wind_direction_10m ?? null,
      visibility: weather.current?.visibility ?? null,
      airTemp: weather.current?.temperature_2m ?? null,
      cloudCover: weather.current?.cloud_cover ?? null,
      hourly: {
        time: marine.hourly?.time || [],
        waveHeight: marine.hourly?.wave_height || [],
        seaTemp: marine.hourly?.sea_surface_temperature || [],
        windSpeed: weather.hourly?.wind_speed_10m || []
      },
      fetchedAt: new Date().toISOString(),
      source: 'Open-Meteo Marine API'
    };
    return lastWeatherData;
  } catch (err) {
    console.warn('Cuaca real gagal, pakai cache terakhir:', err);
    return lastWeatherData;
  }
}

function assessSafety(data) {
  if (!data) return { level: 'unknown', label: 'Data tidak tersedia', cls: 'safety-caution' };
  const wave = data.waveHeight ?? 0;
  const wind = data.windSpeed ?? 0;
  if (wave > 2.5 || wind > 25) return { level: 'danger', label: '⛔ BERBAHAYA — Jangan melaut', cls: 'safety-danger' };
  if (wave > 1.5 || wind > 15) return { level: 'caution', label: '⚠️ HATI-HATI — Gelombang sedang', cls: 'safety-caution' };
  return { level: 'safe', label: '✅ AMAN untuk melaut', cls: 'safety-safe' };
}

async function updateMapForecastPanel(lat, lng) {
  const data = await fetchMarineWeather(lat, lng);
  if (!data) {
    document.getElementById('forecast-info').textContent = 'Data cuaca tidak tersedia. Periksa koneksi.';
    return;
  }
  document.getElementById('marine-forecast-wave').textContent = data.waveHeight != null ? `${data.waveHeight.toFixed(1)} m` : '—';
  document.getElementById('marine-forecast-wind').textContent = data.windSpeed != null ? `${data.windSpeed.toFixed(1)} km/h` : '—';
  document.getElementById('marine-forecast-temp').textContent = data.seaTemp != null ? `${data.seaTemp.toFixed(1)}°C` : '—';
  document.getElementById('marine-forecast-visibility').textContent = data.visibility != null ? `${(data.visibility / 1000).toFixed(0)} km` : '—';

  const safety = assessSafety(data);
  const statusEl = document.getElementById('marine-safety-status');
  statusEl.textContent = safety.label;
  statusEl.className = `marine-safety-status ${safety.cls}`;

  document.getElementById('forecast-info').textContent = `Sumber: ${data.source} • ${new Date(data.fetchedAt).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}`;
  document.getElementById('forecast-details').innerHTML =
    `<div>🌊 ${data.waveHeight?.toFixed(1) ?? '—'} m (${data.wavePeriod?.toFixed(0) ?? '—'} s)</div>` +
    `<div>💨 ${data.windSpeed?.toFixed(1) ?? '—'} km/h (gust ${data.windGust?.toFixed(1) ?? '—'})</div>` +
    `<div>🌡️ Air laut ${data.seaTemp?.toFixed(1) ?? '—'}°C | Udara ${data.airTemp?.toFixed(1) ?? '—'}°C</div>`;

  return data;
}

async function renderWeatherTab(lat = -6.2, lng = 106.8, locationName = 'Jakarta') {
  const data = await fetchMarineWeather(lat, lng);
  if (!data) return;
  const safety = assessSafety(data);

  document.getElementById('weather-location-name').textContent = locationName;
  document.getElementById('weather-current-temp').textContent = `${data.airTemp?.toFixed(0) ?? '—'}°C`;
  document.getElementById('weather-current-desc').textContent = safety.label;
  document.getElementById('weather-humidity').textContent = data.cloudCover != null ? `Awan ${data.cloudCover}%` : '—';
  document.getElementById('weather-wind').textContent = `${data.windSpeed?.toFixed(1) ?? '—'} km/h`;
  document.getElementById('weather-wave').textContent = `${data.waveHeight?.toFixed(1) ?? '—'} m`;
  document.getElementById('weather-visibility').textContent = `${(data.visibility / 1000)?.toFixed(0) ?? '—'} km`;

  document.getElementById('marine-wave-height').textContent = `${data.waveHeight?.toFixed(1) ?? '—'} m`;
  document.getElementById('marine-water-temp').textContent = `${data.seaTemp?.toFixed(0) ?? '—'}°C`;
  document.getElementById('marine-wind-speed').textContent = `${data.windSpeed?.toFixed(0) ?? '—'} km/h`;
  document.getElementById('marine-wind-dir').textContent = degToCardinal(data.windDirection);
  document.getElementById('marine-air-temp').textContent = `${data.airTemp?.toFixed(1) ?? '—'}°C`;
  document.getElementById('marine-wind-gust').textContent = `${data.windGust?.toFixed(0) ?? '—'} km/h`;

  if (typeof Chart !== 'undefined' && data.hourly?.time?.length) {
    const ctx = document.getElementById('weather-chart')?.getContext('2d');
    if (!ctx) return;
    if (weatherChartInstance) weatherChartInstance.destroy();
    const labels = data.hourly.time.slice(0, 24).map(t => t.slice(11, 16));
    weatherChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Gelombang (m)', data: data.hourly.waveHeight.slice(0, 24), borderColor: 'rgb(75,192,192)', backgroundColor: 'rgba(75,192,192,.15)', tension: .3, yAxisID: 'y' },
          { label: 'Angin (km/h)', data: data.hourly.windSpeed.slice(0, 24), borderColor: 'rgb(54,162,235)', backgroundColor: 'rgba(54,162,235,.15)', tension: .3, yAxisID: 'y1' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: { y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } }
      }
    });
  }

  // 5-day forecast
  const forecastContainer = document.getElementById('forecast-days');
  if (forecastContainer && data.hourly?.time?.length) {
    const days = {};
    data.hourly.time.forEach((t, i) => {
      const day = t.slice(0, 10);
      if (!days[day]) days[day] = { temps: [], waves: [] };
      days[day].temps.push(data.hourly.seaTemp?.[i] ?? 0);
      days[day].waves.push(data.hourly.waveHeight?.[i] ?? 0);
    });
    forecastContainer.innerHTML = Object.entries(days).slice(0, 5).map(([day, d]) => {
      const avgTemp = (d.temps.reduce((a,b)=>a+b,0) / d.temps.length).toFixed(0);
      const maxWave = Math.max(...d.waves).toFixed(1);
      return `<div class="forecast-day">
        <div class="forecast-day-name">${new Date(day).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { weekday: 'short' })}</div>
        <div class="forecast-day-icon">${maxWave > 2 ? '🌊' : maxWave > 1 ? '⛅' : '☀️'}</div>
        <div class="forecast-day-temp">${avgTemp}°C<br><small>${maxWave} m</small></div>
      </div>`;
    }).join('');
  }

  const alertContainer = document.getElementById('weather-alert-container');
  alertContainer.innerHTML = '';
  if (safety.level === 'danger') {
    alertContainer.innerHTML = `<div class="weather-alert danger"><div class="weather-alert-icon">⚠️</div><div><div class="weather-alert-title">Kondisi Berbahaya</div><div>Gelombang ${data.waveHeight?.toFixed(1)} m & angin ${data.windSpeed?.toFixed(0)} km/h. Jangan melaut.</div></div></div>`;
  } else if (safety.level === 'caution') {
    alertContainer.innerHTML = `<div class="weather-alert"><div class="weather-alert-icon">⚠️</div><div><div class="weather-alert-title">Hati-hati</div><div>Gelombang ${data.waveHeight?.toFixed(1)} m. Gunakan pelampung.</div></div></div>`;
  }
}

function degToCardinal(deg) {
  if (deg == null) return '—';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}
