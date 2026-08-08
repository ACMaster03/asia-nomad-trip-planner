/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
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
      // SEQUENTIALLY, not Promise.all. Seven parallel authenticated document
      // fetches from a phone saturate the connection and compete with the
      // navigation the user is actually waiting on — which the NetworkFirst
      // handler below then gives up on, showing the offline page while online.
      // Warming is background work; it has no business winning that race.
      for (const url of urls) {
        try {
          const resp = await fetch(url, { credentials: "same-origin" });
          if (resp.ok && !resp.redirected) await cache.put(url, resp);
        } catch {
          /* offline while warming — never mind */
        }
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
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
      // Traveller pushes carry their click target ('/live', '/itinerary' —
      // gap 4). Follower pushes carry none: their target is the follow URL
      // this device stored at subscribe time (the DB never holds raw tokens).
      data: data.url ? { url: data.url } : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const payloadUrl = (event.notification.data as { url?: string } | undefined)?.url;
  event.waitUntil(
    (async () => {
      if (payloadUrl) {
        // traveller notification → focus any open app window on that path,
        // else open one
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const existing = wins.find((w) => new URL(w.url).pathname === payloadUrl);
        if (existing) return existing.focus();
        return self.clients.openWindow(payloadUrl);
      }
      // follower notification → the device-local way home (see above)
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
    // NEVER CACHE THE FOLLOW PAGE. Its document is server-rendered with the
    // trip summary already in the HTML, so a cached copy keeps showing the
    // route and dates after the owner revokes or pauses the link — revocation
    // that stops at the network is not revocation. Followers lose offline
    // access to this one page; being able to withdraw a link is worth more.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/follow/"),
      handler: new NetworkOnly(),
    },
    // Navigations: defaultCache's own "pages" entry matches on the
    // request's Content-Type header, which GET navigations don't carry — so
    // documents ended up in the tiny shared "others" cache. Match on
    // request.mode instead so visited screens reliably reopen offline.
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        // 10s was too aggressive: a cold Vercel lambda plus a phone on mobile
        // data can legitimately exceed it, and the fallback then claims the
        // user is OFFLINE while they are not. The timeout exists so a truly
        // dead network reaches the cache quickly, not to police slow ones.
        networkTimeoutSeconds: 25,
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // NEVER CACHE RSC PAYLOADS. Serwist's defaultCache keeps them for 24h in
    // "pages-rsc" and "pages-rsc-prefetch", but an RSC payload is bound to the
    // Next.js BUILD ID that produced it. After a deploy the client shell is the
    // new build while the cache still holds the old build's payloads, so a
    // client-side nav link hands the router something it cannot reconcile and
    // Next renders "This page couldn't load. Reload to try again, or go back."
    // A full reload was always fine because that is a document request.
    //
    // Reported on prod 2026-07-25 across iOS Safari and macOS Safari after
    // seven deploys in a day. Caching them buys nothing anyway: they are
    // useless offline (the router needs the shell, which IS cached above) and
    // stale the moment we ship.
    {
      matcher: ({ request, sameOrigin }) =>
        sameOrigin && request.headers.get("RSC") === "1",
      handler: new NetworkOnly(),
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

// Drop the RSC caches a previous worker filled. Nothing reads them any more
// (the NetworkOnly matcher above wins), but devices that already hit the bug
// are carrying build-stale payloads and the space they occupy is dead weight.
// Safe to remove permanently: RSC payloads are per-build and never reusable.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        ["pages-rsc", "pages-rsc-prefetch"].map((name) => caches.delete(name)),
      );
    })(),
  );
});

serwist.addEventListeners();
