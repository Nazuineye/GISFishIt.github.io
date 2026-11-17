/* GISFishIt Service Worker v2 */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

if (workbox) {
  workbox.setConfig({ debug: false });

  const CACHE_VERSION = 'gisfishit-v2';
  workbox.core.setCacheNameDetails({ prefix: 'gisfishit', suffix: 'v2' });

  workbox.precaching.precacheAndRoute([
    { url: 'index.html', revision: CACHE_VERSION },
    { url: 'manifest.json', revision: CACHE_VERSION },
    { url: 'css/style.css', revision: CACHE_VERSION },
    { url: 'js/config.js', revision: CACHE_VERSION },
    { url: 'js/data.js', revision: CACHE_VERSION },
    { url: 'js/i18n.js', revision: CACHE_VERSION },
    { url: 'js/weather.js', revision: CACHE_VERSION },
    { url: 'js/safety.js', revision: CACHE_VERSION },
    { url: 'js/community.js', revision: CACHE_VERSION },
    { url: 'js/slideshow.js', revision: CACHE_VERSION },
    { url: 'js/map.js', revision: CACHE_VERSION },
    { url: 'js/app.js', revision: CACHE_VERSION }
  ]);

  workbox.precaching.cleanupOutdatedCaches();

  // Map tiles
  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('arcgisonline.com') || url.origin.includes('openstreetmap.org'),
    new workbox.strategies.CacheFirst({
      cacheName: 'map-tiles',
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 })]
    })
  );

  // Open-Meteo API
  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('open-meteo.com'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'weather-api',
      networkTimeoutSeconds: 6,
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 })]
    })
  );

  // KKP GeoJSON
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.includes('kkp-zones'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'kkp-data',
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 7 * 24 * 60 * 60 })]
    })
  );

  // Supabase
  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('supabase.co'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'supabase-api',
      networkTimeoutSeconds: 8,
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 })]
    })
  );

  // Images
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'images',
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 90 * 24 * 60 * 60 })]
    })
  );

  // Navigation fallback
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({ cacheName: 'html-pages', networkTimeoutSeconds: 3 })
  );
}
