/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

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
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
