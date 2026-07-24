/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import {
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

// Service worker (M2 PWA baseline). Serwist's defaultCache mirrors Next.js
// asset semantics: build assets cache-first, pages network-first with offline
// fallback to cache. Supabase API calls are NOT cached here — data freshness
// and the offline outbox are TanStack Query's job (IndexedDB persistence);
// the worker only keeps the SHELL loadable offline.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// ---- Web Push (M3) --------------------------------------------------------
// Payload mirrors the shared_feed whitelist (push-fanout function) — nothing
// a follower couldn't already see. The click target comes from DEVICE-LOCAL
// IndexedDB (lib/follow/push.ts stores it at subscribe time): our database
// never holds raw follow tokens, so the server can't put the URL in the
// payload — the device remembers its own way home instead.
import { get } from "idb-keyval";

// ---- Offline shell warm-up ------------------------------------------------
// Client-side navigations never create document cache entries (they're RSC
// fetches), so a force-quit + offline relaunch of "the page you were on"
// missed the cache and fell back to offline.html (phone dogfood, 2026-07-24).
// The signed-in app posts WARM_PAGES once per open; we hard-fetch each route
// (cookies included) and store it under the 'pages' cache the navigation
// handler reads. Redirected responses are skipped — they can't legally answer
// a navigation, and a login redirect cached here would trap the user.
self.addEventListener("message", (event) => {
  const data = event.data as { type?: string; urls?: string[] } | null;
  if (data?.type !== "WARM_PAGES" || !Array.isArray(data.urls)) return;
  const urls = data.urls;
  event.waitUntil(
    (async () => {
      const cache = await caches.open("pages");
      await Promise.all(
        urls.map(async (url) => {
          try {
            const resp = await fetch(url, { credentials: "same-origin" });
            if (resp.ok && !resp.redirected) await cache.put(url, resp);
          } catch {
            /* offline while warming — never mind */
          }
        }),
      );
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    /* non-JSON push → generic notification */
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Trip update", {
      body: data.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = wins.find((w) => w.url.includes("/follow/"));
      if (existing) return existing.focus();
      const url = ((await get("anp-follow-url").catch(() => null)) as string | null) ?? "/";
      return self.clients.openWindow(url);
    })(),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Navigations FIRST: defaultCache's own "pages" entry matches on the
    // request's Content-Type header, which GET navigations don't carry — so
    // documents ended up in the tiny shared "others" cache. Match on
    // request.mode instead so visited screens reliably reopen offline.
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 10,
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
  // Never show the browser's dinosaur: a navigation with no cached copy gets
  // the branded offline page (public/offline.html is in the precache manifest).
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
