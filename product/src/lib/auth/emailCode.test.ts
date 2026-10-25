import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeCode, normaliseCode } from './emailCode.ts'

test('a code copied with spaces or a dash still reads as the code', () => {
  assert.equal(normaliseCode(' 1234 5678 '), '12345678')
  assert.equal(normaliseCode('1234-5678'), '12345678')
  assert.equal(looksLikeCode('1234 5678'), true)
})

test('only digits of a plausible length count as a code', () => {
  assert.equal(looksLikeCode('12345'), false)
  assert.equal(looksLikeCode('12345678901'), false)
  assert.equal(looksLikeCode('1234abcd'), false)
  assert.equal(looksLikeCode(''), false)
})

test("Supabase's refusal of a code reads as a sentence about the newest email", async () => {
  const { codeErrorText } = await import('./emailCode.ts')
  assert.match(codeErrorText('Token has expired or is invalid') ?? '', /newest email/)
  assert.equal(codeErrorText('Email rate limit exceeded'), null)
})
