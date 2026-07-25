import { NextResponse, type NextRequest } from 'next/server'
import { unsubscribeDigest } from '@/lib/digest/api'

// RFC 8058 one-click unsubscribe. This URL is what goes in the List-Unsubscribe
// header of every digest, so Gmail and Apple Mail show their OWN Unsubscribe
// control next to the sender and trust it — which is the whole point: a reader
// who can't find an unsubscribe reaches for the spam button instead.
//
// The POST arrives from the mail provider's servers, not the reader's browser:
// no session, no cookies, no CSRF token, and no page is ever rendered. The
// token in the query string is the only credential.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (t) await unsubscribeDigest(t) // soft delete; repeat calls are idempotent
  // Always 200. A provider that sees an error may keep offering the button, or
  // hold it against the sender — and an unknown token means already-gone anyway.
  return new NextResponse(null, { status: 200 })
}

// A human who opens the header URL directly gets the real page.
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  return NextResponse.redirect(
    new URL(t ? `/digest/unsubscribe?t=${encodeURIComponent(t)}` : '/digest/unsubscribe', req.url),
  )
}
