import type { SupabaseClient } from '@supabase/supabase-js'
import { VAPID_PUBLIC_KEY } from '@/lib/follow/push'

// Traveller push opt-in (M0-gate gap 4, migration 27). The follower flow
// (lib/follow/push.ts) subscribes a SHARE LINK via RPC because followers have
// no accounts; travellers are signed in, so their subscription is a plain
// RLS-owned row keyed to auth.uid(). Same VAPID keypair — one Web Push
// identity for the whole app.

function toUint8(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const b64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export type UserPushState = 'unsupported' | 'ios-install' | 'denied' | 'subscribed' | 'ready'

// iOS WebKit only exposes the push API to Home-Screen-installed web apps
// (16.4+) — in a plain tab we must show install instructions, not silently
// hide. Same detection as the follower flow.
function isIOSBrowserNeedingInstall(): boolean {
  const iOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return iOS && !standalone
}

export async function getUserPushState(): Promise<UserPushState> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    if (typeof window !== 'undefined' && isIOSBrowserNeedingInstall()) return 'ios-install'
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  // getRegistration, NOT .ready — .ready hangs forever on the SW-less dev server.
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'ready'
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'ready'
}

export async function enableUserPush(sb: SupabaseClient): Promise<UserPushState> {
  // requestPermission MUST be the first thing in the tap handler: iOS only
  // shows the prompt during the tap's transient activation (see the follower
  // flow's dogfood note, 2026-07-24).
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'ready'
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  let reg = await navigator.serviceWorker.getRegistration()
  if (!reg) {
    reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 5000)),
    ])
  }
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toUint8(VAPID_PUBLIC_KEY) as BufferSource,
  })
  const json = sub.toJSON()
  const { error } = await sb.from('user_push_subscriptions').upsert(
    {
      user_id: uid,
      transport: 'webpush',
      endpoint: sub.endpoint,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw error
  }
  return 'subscribed'
}

export async function disableUserPush(sb: SupabaseClient): Promise<UserPushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await sb.from('user_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      .then(() => {}, () => {})
    await sub.unsubscribe().catch(() => {})
  }
  return 'ready'
}

// ---------------------------------------------------------------------------
// Notification preferences (migration 37): one notify_prefs row per person,
// no row = the defaults below. The two profiles booleans from 27 are
// mirrored from this row by trigger, so nothing here writes them.
// ---------------------------------------------------------------------------
export type NotifyPrefs = {
  /** stay deadlines: cancel-by and card-charge warnings */
  deadlinePush: boolean
  /** co-travellers' check-ins, arrivals and notes on my own trips */
  ownTripPosts: boolean
  /** new posts by the people I follow */
  followPosts: boolean
  /** comments on my own posts */
  commentsOnMine: boolean
  /** replies to my comments, on any trip */
  replies: boolean
  /** reactions on my posts — the one that defaults off */
  reactions: boolean
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  deadlinePush: true,
  ownTripPosts: true,
  followPosts: true,
  commentsOnMine: true,
  replies: true,
  reactions: false,
}

type PrefsRow = {
  deadline_push: boolean
  own_trip_posts: boolean
  follow_posts: boolean
  comments_on_mine: boolean
  replies: boolean
  reactions: boolean
}
const PREF_COLS: Record<keyof NotifyPrefs, keyof PrefsRow> = {
  deadlinePush: 'deadline_push',
  ownTripPosts: 'own_trip_posts',
  followPosts: 'follow_posts',
  commentsOnMine: 'comments_on_mine',
  replies: 'replies',
  reactions: 'reactions',
}

export async function fetchNotifyPrefs(sb: SupabaseClient): Promise<NotifyPrefs> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const { data, error } = await sb
    .from('notify_prefs')
    .select('deadline_push,own_trip_posts,follow_posts,comments_on_mine,replies,reactions')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) throw error
  const row = data as PrefsRow | null
  if (!row) return DEFAULT_NOTIFY_PREFS
  return {
    deadlinePush: row.deadline_push,
    ownTripPosts: row.own_trip_posts,
    followPosts: row.follow_posts,
    commentsOnMine: row.comments_on_mine,
    replies: row.replies,
    reactions: row.reactions,
  }
}

// Upsert of the whole row: the caller passes the merged state (the query
// cache has it), so a first-ever save does not silently reset the other
// switches to their defaults.
export async function updateNotifyPrefs(sb: SupabaseClient, prefs: NotifyPrefs): Promise<void> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const row: Record<string, boolean | string> = { user_id: uid }
  for (const k of Object.keys(PREF_COLS) as (keyof NotifyPrefs)[]) row[PREF_COLS[k]] = prefs[k]
  const { error } = await sb.from('notify_prefs').upsert(row, { onConflict: 'user_id' })
  if (error) throw error
}

// Per-trip overrides: muted wins over everything for that trip; all_comments
// widens "comments on my posts" to every post of a trip I travel on.
export type TripNotify = { trip_id: string; muted: boolean; all_comments: boolean }

export async function fetchTripNotify(sb: SupabaseClient): Promise<TripNotify[]> {
  const { data, error } = await sb.from('trip_notify').select('trip_id,muted,all_comments')
  if (error) throw error
  return (data as TripNotify[]) ?? []
}

export async function setTripNotify(
  sb: SupabaseClient,
  tripId: string,
  patch: Partial<Pick<TripNotify, 'muted' | 'all_comments'>>,
  current?: TripNotify,
): Promise<void> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const row = {
    user_id: uid,
    trip_id: tripId,
    muted: patch.muted ?? current?.muted ?? false,
    all_comments: patch.all_comments ?? current?.all_comments ?? false,
  }
  const { error } = await sb.from('trip_notify').upsert(row, { onConflict: 'user_id,trip_id' })
  if (error) throw error
}
