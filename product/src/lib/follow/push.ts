import type { SupabaseClient } from '@supabase/supabase-js'
import { set } from 'idb-keyval'

// Follower push opt-in (mock 07 "Notify me", migration 13). VAPID public key
// is public by definition — committed here on purpose; the private half lives
// only in the Edge Function's secrets.
export const VAPID_PUBLIC_KEY =
  'BO9QJGuw_Q7Is0s1nL6t1dQSCH2Uz1tiqHWs5oHTRGnktS9ngfdbP6OoBOIABF5fF50VnJQaANVycQRLnVYeIP4'

function toUint8(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const b64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'subscribed' | 'ready'

// iOS WebKit (Safari, Chrome-on-iOS, in-app browsers — all the same engine)
// only exposes the push API to web apps INSTALLED on the Home Screen (16.4+).
// In a plain tab we must show install instructions, not silently hide.
function isIOSBrowserNeedingInstall(): boolean {
  const iOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS masquerades as macOS but has touch
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return iOS && !standalone
}

export async function getPushState(): Promise<PushState> {
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
  // getRegistration (NOT .ready — .ready hangs forever when no SW is
  // registered, e.g. the Serwist-less dev server).
  const reg = await navigator.serviceWorker.getRegistration()
  // No registration YET is normal on a fresh install's first launch — the
  // push API exists, so offer the button; enablePush waits for the SW.
  if (!reg) return 'ready'
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'ready'
}

export async function enablePush(sb: SupabaseClient, token: string): Promise<PushState> {
  // requestPermission MUST be the first thing in the tap handler: iOS only
  // shows the prompt during the tap's transient activation, and any await
  // before it silently resolves 'default' with no prompt at all
  // (dogfood 2026-07-24: "didn't get prompted" in the installed app).
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'ready'
  // A freshly installed Home-Screen app may still be registering the SW on
  // its first launch — wait briefly for it rather than bailing.
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
  const { error } = await sb.rpc('subscribe_push', {
    p_token: token,
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys!.p256dh,
    p_auth: json.keys!.auth,
  })
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw error
  }
  // remember the way home for notificationclick (device-local — see sw.ts)
  await set('anp-follow-url', `/follow/${token}`).catch(() => {})
  return 'subscribed'
}

// The follow token is required, not decorative: unsubscribe_push used to delete
// by endpoint alone (migration 29), so anyone who learned a push-service URL
// could mute that follower. The token proves the caller holds the link the
// subscription belongs to.
export async function disablePush(sb: SupabaseClient, token: string): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await sb.rpc('unsubscribe_push', { p_token: token, p_endpoint: sub.endpoint }).then(
      () => {},
      () => {},
    )
    await sub.unsubscribe().catch(() => {})
  }
  return 'ready'
}
