// An anonymous visitor taps "Follow Patrik" on a link page, goes off to create
// an account, and comes back. The link and the travellers they ticked are kept
// here in the meantime, so the follow completes without redoing anything.
// localStorage, because the sign-up round trip may open a new tab (magic
// link) — sessionStorage would not survive that. Wrapped in try/catch: a
// private window may refuse storage, and the page must still work.

const KEY = 'livhold.pendingFollow'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface PendingFollow {
  token: string
  /** null = everyone on the trip */
  travellers: string[] | null
  savedAt: number
}

export function savePendingFollow(token: string, travellers: string[] | null): void {
  try {
    const v: PendingFollow = { token, travellers, savedAt: Date.now() }
    window.localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* storage unavailable: the visitor simply follows again after signing in */
  }
}

export function readPendingFollow(now = Date.now()): PendingFollow | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<PendingFollow>
    if (typeof v.token !== 'string' || typeof v.savedAt !== 'number') return null
    if (now - v.savedAt > MAX_AGE_MS) {
      clearPendingFollow()
      return null
    }
    const travellers = Array.isArray(v.travellers) ? v.travellers.filter((t) => typeof t === 'string') : null
    return { token: v.token, travellers, savedAt: v.savedAt }
  } catch {
    return null
  }
}

export function clearPendingFollow(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
