import { type EmailOtpType } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/auth/safeNext'

// Magic-link / email OTP confirmation — the STATELESS arm of sign-in, and the
// one that survives being opened in a different browser from the one that
// asked for the link (see lib/supabase/otp.ts for why that matters).
// Supabase verifies a hashed one-time token here, server-side; nothing has to
// be waiting in the reader's browser, and no token ever lands in the URL bar.
//
// The Supabase email template must point here — docs/AUTH-EMAIL-TEMPLATE.md:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/dashboard
//
// Both query values are attacker-controllable, so both are constrained: `type`
// against the OTP types we actually issue, and `next` through safeNextPath —
// the redirect fires after verifyOtp has set the session cookies, so an
// unvalidated path would hand a signed-in visitor straight to another origin.
const OTP_TYPES: readonly EmailOtpType[] = ['magiclink', 'signup', 'invite', 'recovery', 'email_change', 'email']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const rawType = searchParams.get('type')
  const type = OTP_TYPES.find((t) => t === rawType)
  const next = safeNextPath(searchParams.get('next'))

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/auth/auth-code-error?reason=${encodeURIComponent(reason.slice(0, 200))}`, origin),
    )

  if (!token_hash) return fail('the link carried no sign-in token')
  if (!type) return fail(`unsupported link type: ${rawType ?? 'missing'}`)

  // Build the redirect FIRST and let Supabase write the session cookies onto
  // that exact response. Going through next/headers cookies() here would set
  // them on a response this handler then replaces, so a verified sign-in could
  // still land on /dashboard with no session and bounce back to /login.
  const success = NextResponse.redirect(new URL(next, origin))
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            success.cookies.set(name, value, options),
          ),
      },
    },
  )

  const { error } = await supabase.auth.verifyOtp({ type, token_hash })
  if (error) return fail(error.message)
  return success
}
