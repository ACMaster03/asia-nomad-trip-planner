import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notPending, type LedgerOp } from './ledgerOps.ts'
import type { LedgerEntry } from './types.ts'

const e = (id: string, amount = 10): LedgerEntry =>
  ({ id, date: '2026-09-25', type: 'expense', category: 'subscriptions', amount, currency: 'HUF', note: id })
const up = (entry: LedgerEntry): LedgerOp => ({ kind: 'upsert', entry })

test('an op already queued is not queued again', () => {
  const ops = [up(e('a')), up(e('b')), { kind: 'delete', id: 'c' } as LedgerOp]
  const queued = [up(e('a')), { kind: 'delete', id: 'c' } as LedgerOp]
  assert.deepEqual(notPending(ops, queued), [up(e('b'))])
})

test('a changed entry with the same id still goes out', () => {
  assert.deepEqual(notPending([up(e('a', 12))], [up(e('a', 10))]), [up(e('a', 12))])
})

test('nothing queued: every op goes out', () => {
  const ops = [up(e('a')), up(e('b'))]
  assert.deepEqual(notPending(ops, []), ops)
})
