/* GISFishIt Service Worker v4 */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

if (workbox) {
  workbox.setConfig({ debug: false });
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  const CACHE_VERSION = 'gisfishit-v4-4';
  workbox.core.setCacheNameDetails({ prefix: 'gisfishit', suffix: 'v4-4' });

  // FIX #9: Relative ./ paths so GH Pages subfolders and root both resolve cleanly
  workbox.precaching.precacheAndRoute([
    { url: './index.html', revision: CACHE_VERSION },
    { url: './manifest.json', revision: CACHE_VERSION },
    { url: './css/style.css', revision: CACHE_VERSION },
    { url: './css/animations.css', revision: CACHE_VERSION },
    { url: './js/boot.js', revision: CACHE_VERSION },
    { url: './js/config.js', revision: CACHE_VERSION },
    { url: './js/data.js', revision: CACHE_VERSION },
    { url: './js/i18n.js', revision: CACHE_VERSION },
    { url: './js/storage.js', revision: CACHE_VERSION },
    { url: './js/weather.js', revision: CACHE_VERSION },
    { url: './js/safety.js', revision: CACHE_VERSION },
    { url: './js/community.js', revision: CACHE_VERSION },
    { url: './js/settings.js', revision: CACHE_VERSION },
    { url: './js/modal.js', revision: CACHE_VERSION },
    { url: './js/map.js', revision: CACHE_VERSION },
    { url: './js/ui.js', revision: CACHE_VERSION },
    { url: './js/app.js', revision: CACHE_VERSION }
  ]);

  workbox.precaching.cleanupOutdatedCaches();

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.includes('v4-4') && !k.includes('weather-api-v4') && !k.includes('bmkg-api-v4') && !k.includes('ndbc-api-v4') && !k.includes('tide-api-v4'))
            .map((k) => caches.delete(k))
        )
      )
    );
  });

  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin.includes('arcgisonline.com') ||
      url.origin.includes('openstreetmap.org'),
    new workbox.strategies.CacheFirst({
      cacheName: 'map-tiles-v4-2',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 500,
          maxAgeSeconds: 30 * 24 * 60 * 60
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('open-meteo.com'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'weather-api-v4',
      networkTimeoutSeconds: 6,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 60 * 60
        })
      ]
    })
  );

  // BMKG Maritime Weather API (30 min cache)
  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('peta-maritim.bmkg.go.id'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'bmkg-api-v4',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 10,
          maxAgeSeconds: 30 * 60
        })
      ]
    })
  );

  // NOAA NDBC Buoy Observations (15 min cache)
  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('ndbc.noaa.gov'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'ndbc-api-v4',
      networkTimeoutSeconds: 5,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
          maxAgeSeconds: 15 * 60
        })
      ]
    })
  );

  // TideCheck / Open Waters Tides (6 hour cache)
  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('tidecheck.com') || url.origin.includes('openwaters.io'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'tide-api-v4',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 10,
          maxAgeSeconds: 6 * 60 * 60
        })
      ]
    })
  );

  // Beach Day API (24 hour cache)
  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('beachday.io'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'beach-api-v4',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 10,
          maxAgeSeconds: 24 * 60 * 60
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.pathname.includes('kkp-zones'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'kkp-data-v3',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 5,
          maxAgeSeconds: 7 * 24 * 60 * 60
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('supabase.co'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'supabase-api-v3',
      networkTimeoutSeconds: 8,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'images-v3',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 90 * 24 * 60 * 60
        })
      ]
    })
  );

  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'html-pages-v3',
      networkTimeoutSeconds: 3
    })
  );
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html?tab=weatherSection');
    })
  );
});
