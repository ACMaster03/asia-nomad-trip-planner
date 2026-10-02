import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseSignup } from '@/lib/journey/signup'

// Where the journey.livhold.com list form sends its answers (docs/landing-form).
//
// That page is hosted outside this repo, so the form cannot share the app's
// Supabase client: it POSTs JSON here, cross-origin, and this route writes the
// row. Which is also why the endpoint, not the page, holds the Supabase
// details: nothing but this URL is pasted into the hosted page, and the page
// can move (to livhold.com itself, say) without the form changing.
//
// No session, no cookies, no CSRF token: the request comes from a visitor who
// has no account, possibly from inside a sandboxed embed whose Origin reads
// `null`. So CORS is open. The most this route can do is add a row the public
// key may add anyway (migration 44: insert-only for anon), and the visitor's
// answers are the request itself. Abuse controls: the spam-trap field, the
// checks in lib/journey/signup.ts, and the table's own constraints.
//
// Answers: 204 stored (a bot is told the same, and nothing is stored); 400 a
// submission that cannot be stored (the form never sends one); 502 the
// database refused it. The form treats anything but 2xx as "That didn't go
// through" and keeps the answers for another try.

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
}

const empty = (status: number) => new NextResponse(null, { status, headers: CORS })
const refuse = (status: number, error: string) => NextResponse.json({ error }, { status, headers: CORS })

// The browser asks before a cross-origin JSON POST.
export function OPTIONS() {
  return empty(204)
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return refuse(400, 'body')
  }
  const parsed = parseSignup(body)
  if (parsed.ok === 'bot') return empty(204)
  if (!parsed.ok) return refuse(400, parsed.reason)

  // The public key, as the hosted page would have used it: migration 44 lets
  // it insert and nothing else. No cookie jar and nothing to keep.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await sb.from('journey_signups').insert(parsed.row)
  if (error) {
    console.error('[journey-signup] insert refused:', error.message)
    return refuse(502, 'not stored')
  }
  return empty(204)
}
