import { createClient } from '@/lib/supabase/server'
import { fetchSharedSummary } from '@/lib/follow/api'

// Per-token web-app manifest for the follower page. Without it, iOS
// Add-to-Home-Screen would inherit the APP manifest whose start_url is
// /dashboard — launching Mom's icon into a login page. Here start_url/scope
// pin the install to her follow link, and installing is exactly what unlocks
// Web Push on iOS (16.4+).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const sb = await createClient()
  const summary = await fetchSharedSummary(sb, token).catch(() => null)
  const name = summary ? `Follow ${summary.tripName}` : 'Follow the trip'
  return Response.json(
    {
      name,
      short_name: 'Follow',
      description: 'Live trip updates — route, check-ins and notes.',
      start_url: `/follow/${token}`,
      scope: `/follow/${token}`,
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: '#0d9488',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  )
}
