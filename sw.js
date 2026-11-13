/* Pit Wall service worker: offline play. Serves from cache, refreshes in the background.
   Bump VERSION when files are added or removed. */
const VERSION = "pitwall-v6";
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "img/cars/apx.webp",
  "img/cars/hal.webp",
  "img/cars/irb.webp",
  "img/cars/kes.webp",
  "img/cars/mer.webp",
  "img/cars/nst.webp",
  "img/cars/sol.webp",
  "img/cars/vio.webp",
  "img/cars/vol.webp",
  "img/cars/you-21d4fd.webp",
  "img/cars/you-7c4dff.webp",
  "img/cars/you-c6ff00.webp",
  "img/cars/you-ff5e3a.webp",
  "img/cars/you-ffb000.webp",
  "img/cars/you-ffffff.webp",
  "img/drivers/ARI.webp",
  "img/drivers/BEL.webp",
  "img/drivers/BRT.webp",
  "img/drivers/CAS.webp",
  "img/drivers/COL.webp",
  "img/drivers/DUA.webp",
  "img/drivers/GAU.webp",
  "img/drivers/HAD.webp",
  "img/drivers/HAR.webp",
  "img/drivers/IVA.webp",
  "img/drivers/KEL.webp",
  "img/drivers/KOW.webp",
  "img/drivers/LEF.webp",
  "img/drivers/LIN.webp",
  "img/drivers/LUN.webp",
  "img/drivers/MAR.webp",
  "img/drivers/MEN.webp",
  "img/drivers/MOR.webp",
  "img/drivers/NOV.webp",
  "img/drivers/OKA.webp",
  "img/drivers/PET.webp",
  "img/drivers/REI.webp",
  "img/drivers/REY.webp",
  "img/drivers/SAL.webp",
  "img/drivers/SAN.webp",
  "img/drivers/SHA.webp",
  "img/drivers/VID.webp",
  "img/drivers/WEB.webp",
  "img/drivers/WHI.webp",
  "img/drivers/rookie-f1.webp",
  "img/drivers/rookie-m1.webp",
  "img/drivers/rookie-m2.webp",
  "img/icons/apple-touch-icon.png",
  "img/icons/icon-192.png",
  "img/icons/icon-512.png",
  "img/icons/icon-maskable-512.png",
  "js/daily.js",
  "js/data.js",
  "js/game.js",
  "js/help.js",
  "js/race.js",
  "js/saves.js",
  "js/tracks.js",
  "js/ui.js",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com");
  if (!cacheable) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: url.origin === location.origin });
    const fresh = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await fresh) || new Response("Offline", { status: 503 });
  }));
});
