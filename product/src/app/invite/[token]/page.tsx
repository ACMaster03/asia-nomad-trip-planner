import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { fetchInvitePreview } from '@/lib/trips/invites'
import InviteClient from './InviteClient'

// Anna's front door — handoff frame 06b. Public, no auth guard, deliberately
// OUTSIDE the (app) group: the person this page exists for has no account yet.
// The server render seeds the client with the sanitized preview (migration
// 28's anon RPC) so the invite card paints without a loading flash.

export const metadata: Metadata = {
  title: 'You are invited · Livhold',
  robots: { index: false }, // the token in the URL must never reach an index
}

export default async function InvitePage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const sb = await createClient()
  const preview = await fetchInvitePreview(sb, token).catch(() => null)
  return <InviteClient token={token} preview={preview} />
}
