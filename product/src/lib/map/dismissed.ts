// Dismissed meet-up lines (Home), remembered in this browser per signed-in
// user. A tiny external store so the list can be read with
// useSyncExternalStore: the server snapshot is empty, and the browser's own
// snapshot is cached until a write, so React sees a stable value.

const LS = 'anp_meetups_dismissed'
const EMPTY: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()
let cacheFor: string | null = null
let cache: ReadonlySet<string> = EMPTY

const keyFor = (userId: string | undefined) => `${LS}:${userId ?? 'anon'}`

function read(userId: string | undefined): ReadonlySet<string> {
  const k = keyFor(userId)
  if (cacheFor === k) return cache
  let out: ReadonlySet<string> = EMPTY
  try {
    const raw = localStorage.getItem(k)
    if (raw) out = new Set((JSON.parse(raw) as unknown[]).filter((x): x is string => typeof x === 'string'))
  } catch {}
  cacheFor = k
  cache = out
  return out
}

export function dismissMeetup(userId: string | undefined, key: string) {
  const next = new Set(read(userId))
  next.add(key)
  cache = next
  try { localStorage.setItem(keyFor(userId), JSON.stringify([...next])) } catch {}
  listeners.forEach((l) => l())
}

export const dismissedStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  snapshot: (userId: string | undefined) => () => read(userId),
  serverSnapshot: () => EMPTY,
}
