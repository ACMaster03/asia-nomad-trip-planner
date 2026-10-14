import { createClient } from '@/lib/supabase/server'
import SignInMethodsClient from './SignInMethodsClient'

// Sign-in methods, from Account (round 5b). Not trip-scoped, like Account: a
// "forgot password" link lands here with or without a journey.
export default async function SignInMethodsPage() {
  const sb = await createClient()
  const { data } = await sb.auth.getClaims()
  const email = (data?.claims?.email as string | undefined) ?? ''
  return <SignInMethodsClient email={email} />
}
