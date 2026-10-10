// Kill switch for the web app's old service worker (#163, docs/APP-MOVE-BRIEF.md, step 5).
//
// Until the switch, livhold.com served the app, and phones that installed it keep a
// service worker for livhold.com that answers from its own cache. A browser refuses a
// redirected service-worker script, so the redirects in vercel.json cannot reach it.
// Instead the browser, on its next visit, finds this file at the same address, installs
// it in place of the old one, and this worker clears every cache, unregisters itself and
// reloads the open windows: they then load from the network, which means this landing
// page, or app.livhold.com through the redirects. The landing page never registers it,
// so it only ever reaches a browser that already had the app's worker.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      await self.registration.unregister()
      await self.clients.claim()
      const windows = await self.clients.matchAll({ type: 'window' })
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => null)))
    })(),
  )
})
