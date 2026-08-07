import type { SupabaseClient } from '@supabase/supabase-js'

// The invitee's side of the invite mechanism (migration 25).
//
// Everything below goes through RPCs rather than table access, because a
// pending invitee has NO access to the trip yet: can_view_trip is false until
// the membership row exists, so the trip's own name is unreadable to the very
// person being asked to join it. The definer functions hand back three
// sanitized columns and nothing else.
//
// The inviter's side is createInvite() in queries.ts, which writes the row.

export interface PendingInvite {
  invite_id: string
  trip_id: string
  trip_name: string
  role: 'editor' | 'viewer'
  invited_by_name: string
  created_at: string
}

// What am I invited to? Empty for the overwhelmingly common case (nobody is
// invited to anything), so callers render nothing rather than a placeholder.
export async function fetchPendingInvites(sb: SupabaseClient): Promise<PendingInvite[]> {
  const { data, error } = await sb.rpc('pending_invites')
  if (error) throw error
  return (data as PendingInvite[]) ?? []
}

// Join the trip. Returns the trip id so the caller can switch to it.
//
// The ROLE is not a parameter — accept_invite reads it from the invite row, so
// there is no way to ask for a better one than you were offered. Accepting
// twice is a no-op, not an error.
export async function acceptInvite(sb: SupabaseClient, inviteId: string): Promise<string> {
  const { data, error } = await sb.rpc('accept_invite', { p_invite: inviteId })
  if (error) throw error
  return data as string
}

// Clear an invite you don't want. Marks it revoked (migration 25 widened the
// guard trigger by exactly this one transition) so it stops being offered.
export async function declineInvite(sb: SupabaseClient, inviteId: string): Promise<void> {
  const { error } = await sb.rpc('decline_invite', { p_invite: inviteId })
  if (error) throw error
}

// The INVITER's view: invites sent for this trip that nobody has answered yet.
// Readable through the ordinary invites_select policy (can_access_trip branch)
// — no RPC needed on this side.
export interface SentInvite {
  id: string
  email: string
  role: 'editor' | 'viewer'
  created_at: string
  /** goes into the emailed /invite/[token] link (migration 28) */
  token: string
}

export async function fetchSentInvites(sb: SupabaseClient, tripId: string): Promise<SentInvite[]> {
  const { data, error } = await sb
    .from('trip_invites')
    .select('id, email, role, created_at, token')
    .eq('trip_id', tripId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as SentInvite[]) ?? []
}

// Withdraw an invite that hasn't been accepted. Allowed by invites_update's
// can_edit_trip branch, which the guard trigger lets through untouched.
export async function revokeInvite(sb: SupabaseClient, inviteId: string): Promise<void> {
  const { error } = await sb.from('trip_invites').update({ status: 'revoked' }).eq('id', inviteId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// The TOKEN side (migration 28) — /invite/[token], handoff frame 06b.
// The emailed link is opened by someone with no session at all, so both reads
// go through anon-callable definer RPCs; the token in the URL is the only
// credential, and it unlocks exactly these four fields.
// ---------------------------------------------------------------------------

export interface InvitePreview {
  trip_name: string
  invited_by_name: string
  email: string
  role: 'editor' | 'viewer'
}

// Null means unknown, revoked OR already accepted — the RPC deliberately does
// not distinguish, so the page shows one generic "not live anymore" state.
export async function fetchInvitePreview(sb: SupabaseClient, token: string): Promise<InvitePreview | null> {
  const { data, error } = await sb.rpc('invite_preview', { p_token: token })
  if (error) throw error
  return (data as InvitePreview | null) ?? null
}

// After the magic link signed her in. Same rules as acceptInvite (the RPC
// delegates to accept_invite), plus one kindness: re-opening the link after a
// successful accept returns the trip id again instead of erroring.
export async function acceptInviteByToken(sb: SupabaseClient, token: string): Promise<string> {
  const { data, error } = await sb.rpc('accept_invite_by_token', { p_token: token })
  if (error) throw error
  return data as string
}
