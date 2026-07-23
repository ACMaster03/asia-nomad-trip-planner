import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { fetchSharedSummary } from '@/lib/follow/api'
import FollowClient from './FollowClient'

// Public, no auth guard — deliberately OUTSIDE the (app) group. The token in
// the URL is the only credential; the server render just seeds the client
// with the sanitized summary (nice link previews, no loading flash).

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params
  const sb = await createClient()
  const s = await fetchSharedSummary(sb, token).catch(() => null)
  return {
    title: s ? `Follow ${s.tripName}` : 'Follow a trip',
    description: s ? 'Live trip updates — route, check-ins and notes.' : undefined,
    robots: { index: false }, // link-knowledge IS the access control — never index
  }
}

export default async function FollowPage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const sb = await createClient()
  const initial = await fetchSharedSummary(sb, token).catch(() => null)
  return <FollowClient token={token} initialSummary={initial} />
}
