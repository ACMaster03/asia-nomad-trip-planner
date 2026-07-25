// Digest lifecycle calls. These run SERVER-side (the confirm/unsubscribe pages
// and the one-click route) and proxy to the `digest` Edge Function, which owns
// the subscription tables — digest_subscriptions is deny-all RLS, so there is
// no client path to them and no RPC to add.
//
// The token in the link is the only credential, exactly as on /follow/[token].

export type Frequency = 'daily' | 'weekly'

/** A resolved subscription, enough to render the page and offer the live link. */
export interface DigestSubject {
  email: string
  tripName: string
  viewUrl: string
  frequency?: Frequency
}

export type ConfirmResult =
  | ({ status: 'confirmed' | 'already'; frequency: Frequency } & DigestSubject)
  /** Token used, replaced by a newer request, or never existed — indistinguishable. */
  | { status: 'invalid' }
  /** Couldn't reach the function. NOTHING was changed — never claim success. */
  | { status: 'error' }

export type UnsubResult =
  | ({ status: 'unsubscribed' } & DigestSubject)
  /** Already gone or bogus. Still rendered as success: unsub links must never fail. */
  | { status: 'unknown' }
  | { status: 'error' }

export type ResubscribeResult =
  | ({ status: 'resubscribed'; frequency: Frequency } & DigestSubject)
  | { status: 'unknown' }
  | { status: 'error' }

async function callDigest(action: string, t: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/digest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, t }),
    cache: 'no-store', // every one of these mutates
  })
  if (!res.ok) throw new Error(`digest ${action} failed: ${res.status}`)
  return await res.json()
}

export async function confirmDigest(t: string): Promise<ConfirmResult> {
  try {
    return (await callDigest('confirm', t)) as ConfirmResult
  } catch {
    return { status: 'error' }
  }
}

export async function unsubscribeDigest(t: string): Promise<UnsubResult> {
  try {
    return (await callDigest('unsub', t)) as UnsubResult
  } catch {
    return { status: 'error' }
  }
}

export async function resubscribeDigest(t: string): Promise<ResubscribeResult> {
  try {
    return (await callDigest('resubscribe', t)) as ResubscribeResult
  } catch {
    return { status: 'error' }
  }
}
