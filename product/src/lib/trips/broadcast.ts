import type { SupabaseClient } from '@supabase/supabase-js'

// Followers poll the sanitized feed every 45s (FollowClient). This nudges them
// so a check-in shows up in about a second instead — measured 884ms staging.
//
// THE PING CARRIES NO PAYLOAD. It means "something changed"; the follower then
// re-reads through shared_feed / shared_trip_summary exactly as it always has.
// So there is no second copy of trip data on the wire, and revoke / pause /
// expire keep working untouched — the RPC still refuses, the ping just goes
// nowhere useful.
//
// Sent from the client rather than a database trigger because
// Broadcast-from-Database is unavailable here: realtime.messages is daily
// partitioned, both projects have zero partitions, and realtime.send() only
// raises a WARNING when it can't write — the ping vanishes and the check-in
// still commits. See supabase/migrations/18-broadcast-position.sql.

const SEND_TIMEOUT_MS = 3000

/**
 * Best-effort. Never throws and never blocks the caller's success path: a
 * check-in that saved must not look like it failed because a WebSocket was
 * down, and the 45s poll is still there as the floor.
 */
export async function broadcastTripUpdate(sb: SupabaseClient, tripId: string): Promise<void> {
  try {
    const { data, error } = await sb
      .from('trip_shares')
      .select('broadcast_topic, expires_at')
      .eq('trip_id', tripId)
      .is('revoked_at', null)
      .is('paused_at', null)
    if (error || !data?.length) return

    const now = Date.now()
    const topics = data
      .filter((r) => !r.expires_at || +new Date(r.expires_at as string) > now)
      .map((r) => r.broadcast_topic as string)

    await Promise.all(topics.map((topic) => pingTopic(sb, topic)))
  } catch {
    // swallowed on purpose — see the doc comment
  }
}

async function pingTopic(sb: SupabaseClient, topic: string): Promise<void> {
  const channel = sb.channel(topic)
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SEND_TIMEOUT_MS)
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        channel
          .send({ type: 'broadcast', event: 'trip_update', payload: {} })
          .catch(() => {})
          .finally(() => {
            clearTimeout(timer)
            resolve()
          })
      })
    })
  } finally {
    await sb.removeChannel(channel)
  }
}

/** Only follower-visible changes are worth waking anyone up for. */
export function isFollowerVisible(visibility: string | undefined): boolean {
  return visibility === 'followers' || visibility === 'public'
}
