import { createClient } from '@/lib/supabase/server'
import AccountClient from './AccountClient'

// Account — app-level, deliberately NOT trip-scoped (design/mocks/13-account.html).
//
// No prefetchTripScreen, no active-trip guard, nothing that can fail when the
// caller has no readable trip: this page must render identically with a live
// trip, with zero trips, mid-onboarding, and right after access to the active
// trip was revoked. Those were the exact dead-ends dogfooding hit (2026-07-26)
// — deleting your last trip, or losing access to it, silently removed the only
// path to "Delete my account", because it lived on the trip-gated Settings page.
//
// The email comes from the claims the layout has already verified, so this adds
// no auth round trip.
export default async function AccountPage() {
  const sb = await createClient()
  const { data } = await sb.auth.getClaims()
  const email = (data?.claims?.email as string | undefined) ?? ''
  return <AccountClient email={email} />
}
