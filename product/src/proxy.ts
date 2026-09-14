import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next 16: this file replaces middleware.ts (it runs on the Node.js runtime).
//
// FAIL OPEN. This runs in front of nearly every route, so anything it throws
// takes down the WHOLE site at once — and a throw here is answered by a bare
// `Internal Server Error` (21 bytes, text/plain, no page), which in a browser
// looks like the domain is simply not responding. That is exactly how a missing
// NEXT_PUBLIC_SUPABASE_* pair presented on 2026-08-21: every route dead, no
// message anywhere except the function log.
//
// Passing the request through is safe: this proxy only REFRESHES a session, it
// never grants one. `(app)/layout.tsx` re-checks auth server-side on every
// request and redirects to /login when it fails ("Never rely on the proxy
// alone"), so a skipped refresh costs a stale cookie, not access.
export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch (e) {
    console.error('[proxy] session refresh failed — passing request through:', e)
    return NextResponse.next({ request })
  }
}

export const config = {
  matcher: [
    // `follow` is the public no-account page — an auth-refresh roundtrip
    // would be pure latency for followers who never have a session. Same for
    // `digest` (confirm/unsubscribe landings) and `api/digest` — the one-click
    // POST arrives from a mail provider's servers, which have no cookies at all.
    // `privacy`, `terms` and `delete-account` join them: a Play reviewer and a
    // crawler both open those signed out, and they hold no secret worth a
    // session for. Play REQUIRES the deletion page to work with no sign-in.
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|sw\\.js|manifest\\.webmanifest|offline\\.html|follow|digest|api/digest|privacy|terms|delete-account|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
