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
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'ready'
}

export async function enablePush(sb: SupabaseClient, token: string): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'ready'
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

export async function disablePush(sb: SupabaseClient): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await sb.rpc('unsubscribe_push', { p_endpoint: sub.endpoint }).then(
      () => {},
      () => {},
    )
    await sub.unsubscribe().catch(() => {})
  }
  return 'ready'
}
