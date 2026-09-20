import type { MetadataRoute } from 'next'

// PWA manifest (M2): installable on both travellers' phones. start_url is the
// dashboard — the auth guard redirects to /login when signed out.
//
// THESE TWO COLOURS ARE THE INSTALLED APP'S FIRST IMPRESSION and they were
// still the pre-LIVHOLD kit until 2026-09-20: teal #0d9488 and a near-black
// #0a0a0a, so the icon launched into a black splash with a teal chrome that
// appears nowhere in the app. background_color is what the phone paints while
// the app boots, so it has to be the canvas the app lands on, and theme_color
// has to match viewport.themeColor in layout.tsx or the two disagree about the
// same strip of screen. Both now quote the token layer in globals.css.
//
// Light values only: a manifest carries one pair and cannot answer the media
// query the way viewport.themeColor does. Light is the right one to pick,
// because a light splash that flashes before a dark app reads as a bright
// frame, while a black splash before a bone-white app is the jolt Petra would
// see every single launch.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Livhold',
    short_name: 'Livhold',
    description: 'Plan the trip, live the trip, let them follow.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f0eee9', // --canvas
    theme_color: '#f0eee9', // = viewport.themeColor (light) in layout.tsx
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
