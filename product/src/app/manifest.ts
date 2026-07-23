import type { MetadataRoute } from 'next'

// PWA manifest (M2): installable on both travellers' phones. start_url is the
// dashboard — the auth guard redirects to /login when signed out. Theme color
// matches the app's teal accent.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Asia Nomad Planner',
    short_name: 'Nomad',
    description: 'Plan the trip, live the trip, let them follow.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0d9488',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
