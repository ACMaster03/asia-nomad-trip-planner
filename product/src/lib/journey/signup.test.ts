import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSignup } from './signup.ts'

// What the form on journey.livhold.com sends (docs/landing-form), every field.
const full = {
  when: 'next_3_months',
  length: '3_6_months',
  plan_today: ' A shared Google Sheet and a lot of WhatsApp. ',
  first_name: ' Anna ',
  email: ' anna@example.com ',
  call_ok: true,
  source: 'https://example.com/a-post',
  consent_text_version: '2026-10-01',
  submitted_at: '2026-10-01T09:30:00.000Z',
  website: '',
}

test('a full submission becomes one row, trimmed', () => {
  const r = parseSignup(full)
  assert.equal(r.ok, true)
  if (r.ok !== true) return
  assert.deepEqual(r.row, {
    when: 'next_3_months',
    length: '3_6_months',
    plan_today: 'A shared Google Sheet and a lot of WhatsApp.',
    first_name: 'Anna',
    email: 'anna@example.com',
    call_ok: true,
    source: 'https://example.com/a-post',
    consent_text_version: '2026-10-01',
    submitted_at: '2026-10-01T09:30:00.000Z',
  })
})

test('the required answers: when and length from their lists, an email that looks like one', () => {
  assert.deepEqual(parseSignup({ ...full, when: undefined }), { ok: false, reason: 'when' })
  assert.deepEqual(parseSignup({ ...full, when: 'tomorrow' }), { ok: false, reason: 'when' })
  assert.deepEqual(parseSignup({ ...full, length: '' }), { ok: false, reason: 'length' })
  assert.deepEqual(parseSignup({ ...full, length: 'forever' }), { ok: false, reason: 'length' })
  for (const bad of ['', '  ', 'petra@gmail', 'petra', '@gmail.com', 'a b@c.d', 42]) {
    assert.deepEqual(parseSignup({ ...full, email: bad }), { ok: false, reason: 'email' }, String(bad))
  }
  for (const when of ['on_the_move', 'next_3_months', 'later', 'someday']) assert.equal(parseSignup({ ...full, when }).ok, true, when)
  for (const length of ['1_3_months', '3_6_months', '6_plus_months', 'open_ended']) assert.equal(parseSignup({ ...full, length }).ok, true, length)
})

test('the optional answers may be missing or blank, and blank is stored as null', () => {
  const r = parseSignup({ when: 'later', length: 'open_ended', email: 'b@example.com', consent_text_version: '2026-10-01', submitted_at: full.submitted_at })
  assert.equal(r.ok, true)
  if (r.ok !== true) return
  assert.equal(r.row.plan_today, null)
  assert.equal(r.row.first_name, null)
  assert.equal(r.row.source, null)
  assert.equal(r.row.call_ok, false)
  const blank = parseSignup({ ...full, plan_today: '   ', first_name: '', source: ' ' })
  assert.equal(blank.ok, true)
  if (blank.ok !== true) return
  assert.equal(blank.row.plan_today, null)
  assert.equal(blank.row.first_name, null)
  assert.equal(blank.row.source, null)
})

test("the limits are the table's: refused, not cut, except the referrer", () => {
  assert.equal(parseSignup({ ...full, plan_today: 'x'.repeat(1000) }).ok, true)
  assert.deepEqual(parseSignup({ ...full, plan_today: 'x'.repeat(1001) }), { ok: false, reason: 'plan_today' })
  assert.equal(parseSignup({ ...full, first_name: 'x'.repeat(80) }).ok, true)
  assert.deepEqual(parseSignup({ ...full, first_name: 'x'.repeat(81) }), { ok: false, reason: 'first_name' })
  assert.deepEqual(parseSignup({ ...full, email: 'x'.repeat(195) + '@a.com' }), { ok: false, reason: 'email' })
  assert.deepEqual(parseSignup({ ...full, consent_text_version: '' }), { ok: false, reason: 'consent_text_version' })
  assert.deepEqual(parseSignup({ ...full, consent_text_version: 'v'.repeat(41) }), { ok: false, reason: 'consent_text_version' })
  const long = parseSignup({ ...full, source: 'https://example.com/' + 'p'.repeat(400) })
  assert.equal(long.ok, true)
  if (long.ok === true) assert.equal(long.row.source?.length, 200)
})

test('the spam trap: a filled-in website field is a bot, not an error', () => {
  assert.deepEqual(parseSignup({ ...full, website: 'http://spam.example' }), { ok: 'bot' })
  // The trap wins even over a submission that would otherwise be refused.
  assert.deepEqual(parseSignup({ when: 'no', website: 'x' }), { ok: 'bot' })
})

test('call_ok is true only for a real true', () => {
  for (const v of ['yes', 'true', 1, 'on', undefined, null]) {
    const r = parseSignup({ ...full, call_ok: v })
    assert.equal(r.ok, true)
    if (r.ok === true) assert.equal(r.row.call_ok, false, String(v))
  }
})

test('a submitted_at that does not read as a date is replaced by now', () => {
  const now = new Date('2026-10-02T10:00:00.000Z')
  for (const v of ['yesterday', '', undefined, 123]) {
    const r = parseSignup({ ...full, submitted_at: v }, now)
    assert.equal(r.ok, true)
    if (r.ok === true) assert.equal(r.row.submitted_at, '2026-10-02T10:00:00.000Z', String(v))
  }
})

test('anything but an object is refused', () => {
  for (const v of [null, undefined, 'text', 7, [], [full]]) assert.deepEqual(parseSignup(v), { ok: false, reason: 'body' })
})
