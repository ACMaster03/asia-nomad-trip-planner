import { NextResponse, type NextRequest } from 'next/server'

// TEMPORARY DIAGNOSTIC — livhold.com login outage, 2026-08-21. Delete once done.
//
// Exists because the investigating environment has no egress to *.supabase.co,
// so this borrows the deployment's network to answer one question: is Supabase
// Auth reachable and healthy from where the app actually runs?
//
// Read-only by default. Reports status codes and provider messages only — never
// the keys. Reachable only on a preview deployment, which Vercel Authentication
// protects (ssoProtection = all_except_custom_domains).

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

async function probe(path: string) {
  const started = Date.now()
  try {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` },
      cache: 'no-store',
    })
    const body = await res.text().catch(() => '')
    return {
      path,
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      body: body.slice(0, 600),
    }
  } catch (e) {
    return { path, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started }
  }
}

export async function GET(req: NextRequest) {
  if (!SUPABASE_URL || !ANON_KEY) {
    return NextResponse.json({ error: 'supabase env missing in this deployment' }, { status: 500 })
  }

  const checks = [
    await probe('/auth/v1/health'),
    await probe('/auth/v1/settings'),
    await probe('/rest/v1/'),
  ]

  // Optional: actually attempt the magic-link send and report VERBATIM whatever
  // GoTrue answers — the status the login screen never gets to show.
  const send = req.nextUrl.searchParams.get('send')
  let signIn: unknown = 'not attempted (pass ?send=<email>)'
  if (send) {
    const started = Date.now()
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: send, create_user: true }),
        cache: 'no-store',
      })
      signIn = {
        status: res.status,
        ms: Date.now() - started,
        body: (await res.text().catch(() => '')).slice(0, 800),
      }
    } catch (e) {
      signIn = { error: e instanceof Error ? e.message : String(e), ms: Date.now() - started }
    }
  }

  return NextResponse.json(
    { supabaseUrl: SUPABASE_URL, checks, signIn },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
