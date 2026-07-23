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
