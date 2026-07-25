'use server'

import { resubscribeDigest } from '@/lib/digest/api'

/**
 * Undo, straight off the Unsubscribed page. Safe without a second opt-in: the
 * caller is holding the unsubscribe token from their own inbox, and the row it
 * restores had already confirmed once. The token is the only credential.
 */
export async function undoUnsubscribe(t: string): Promise<'resubscribed' | 'unknown' | 'error'> {
  const result = await resubscribeDigest(t)
  return result.status
}
