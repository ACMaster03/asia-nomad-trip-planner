import type { SupabaseClient } from '@supabase/supabase-js'

// Usage counts (#120, migration 49): one mark per follower, or per follow
// link, per day the feed was opened. That is all /privacy describes, and all
// this sends: no page, no tap, no time. The database keeps one row a day
// whatever arrives; the note in localStorage only saves the second round trip
// of the day. It runs from the page, never from the server render, which link
// previews (WhatsApp, Telegram) also hit. Fire and forget: nothing waits on it
// and a failure stays silent.

/** The database's day (UTC), so the note and the row agree on "today". */
export const utcDay = (now: Date = new Date()) => now.toISOString().slice(0, 10)

/** Mark only when this browser has not marked the same feed today. */
export const shouldMark = (lastMarked: string | null, today: string) => lastMarked !== today

/** Mark the feed as opened today: the follow link's with `token`, the follower's own without. */
export function markFeedOpen(sb: SupabaseClient, token?: string): void {
  const key = `lv-opened:${token ?? 'me'}`
  const today = utcDay()
  try {
    if (!shouldMark(localStorage.getItem(key), today)) return
    localStorage.setItem(key, today)
  } catch {
    // private window or blocked storage: the database still keeps one a day
  }
  void sb.rpc('mark_feed_open', token ? { p_token: token } : {}).then(
    () => undefined,
    () => undefined,
  )
}
