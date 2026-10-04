// The list form on the landing page (landing/, docs/landing-form). That page is
// its own Vercel project, so the form POSTs its answers to /api/journey-signup and
// this module decides what a submission may contain. Everything the form
// checks in the browser is checked again here, and the table's own constraints
// (migration 44) are the last line: a row that gets past all three is one a
// person typed.
//
// Field names and the allowed answers are the form's, verbatim. A mismatch on
// either side shows every visitor "That didn't go through".

export const WHEN = ['on_the_move', 'next_3_months', 'later', 'someday'] as const
export const LENGTH = ['1_3_months', '3_6_months', '6_plus_months', 'open_ended'] as const

export type When = (typeof WHEN)[number]
export type Length = (typeof LENGTH)[number]

/** One row of public.journey_signups, as the endpoint inserts it. */
export interface JourneySignup {
  when: When
  length: Length
  plan_today: string | null
  first_name: string | null
  email: string
  call_ok: boolean
  source: string | null
  consent_text_version: string
  submitted_at: string
}

export type ParsedSignup =
  | { ok: true; row: JourneySignup }
  /** A submission that cannot be stored; `reason` names the field and goes back in the 400. */
  | { ok: false; reason: string }
  /** The spam trap was filled in. Answer as if stored; store nothing. */
  | { ok: 'bot' }

// The form's own test: something, an @, something, a dot, something.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The table's limits (migration 44). Over the limit is refused, not cut: the
// form's maxlength stops a person before this, so a longer value is not theirs.
const LIMITS = { plan_today: 1000, first_name: 80, email: 200, source: 200, consent_text_version: 40 } as const

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function parseSignup(input: unknown, now: Date = new Date()): ParsedSignup {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'body' }
  }
  const d = input as Record<string, unknown>

  if (text(d.website)) return { ok: 'bot' }

  const when = d.when
  if (!WHEN.includes(when as When)) return { ok: false, reason: 'when' }
  const length = d.length
  if (!LENGTH.includes(length as Length)) return { ok: false, reason: 'length' }

  const email = text(d.email)
  if (!email || email.length > LIMITS.email || !EMAIL.test(email)) return { ok: false, reason: 'email' }

  const plan_today = text(d.plan_today)
  if (plan_today.length > LIMITS.plan_today) return { ok: false, reason: 'plan_today' }
  const first_name = text(d.first_name)
  if (first_name.length > LIMITS.first_name) return { ok: false, reason: 'first_name' }

  const consent_text_version = text(d.consent_text_version)
  if (!consent_text_version || consent_text_version.length > LIMITS.consent_text_version) {
    return { ok: false, reason: 'consent_text_version' }
  }

  // Where the visitor came from (a utm_source, else the referrer) is the one
  // value cut to size rather than refused: a long referrer is not their doing.
  const source = text(d.source).slice(0, LIMITS.source)

  // The visitor's clock when it reads as a date, ours otherwise. The purge job
  // runs on created_at, the database's own clock, either way.
  const sent = typeof d.submitted_at === 'string' ? new Date(d.submitted_at) : new Date(NaN)
  const submitted_at = (Number.isNaN(sent.getTime()) ? now : sent).toISOString()

  return {
    ok: true,
    row: {
      when: when as When,
      length: length as Length,
      plan_today: plan_today || null,
      first_name: first_name || null,
      email,
      call_ok: d.call_ok === true,
      source: source || null,
      consent_text_version,
      submitted_at,
    },
  }
}
