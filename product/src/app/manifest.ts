import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

// PWA manifest (M2): installable on both travellers' phones. start_url is the
// dashboard — the auth guard redirects to /login when signed out.
// Colors: a manifest takes ONE value and cannot be media-scoped, so both track
// the light canvas (--canvas #f0eee9) — the same value layout.tsx's light
// themeColor uses, and what #anp-splash paints (background: var(--background)
// → var(--canvas)). Install splash, task-switcher chrome and first paint then
// agree. (Was #0d9488/#0a0a0a, pre-redesign teal that matches no token.)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Livhold',
    short_name: 'Livhold',
    // Same sentence as the <meta> description in layout.tsx: the install
    // card and the search result must not describe different products.
    description: BRAND.intro,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f0eee9',
    theme_color: '#f0eee9',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
