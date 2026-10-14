import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approxMoney, compactNumber, inDays, originalAmount, relativeDay, shortMoney, symbolOf } from './moneyText.ts'
import { fmtMoney } from './format.ts'

const huf = (n: number) => fmtMoney(n, 'HUF')
const usd = (n: number) => fmtMoney(n, 'USD')

test('shortMoney: whole under a million, "1.33 M Ft" above, the symbol on its side', () => {
  assert.equal(symbolOf(huf), 'Ft')
  assert.equal(symbolOf(usd), '$')
  assert.equal(shortMoney(433_840, huf), huf(433_840))
  assert.equal(shortMoney(1_327_825, huf), '1.33 M Ft')
  assert.equal(shortMoney(12_500_000, huf), '12.5 M Ft')
  assert.equal(shortMoney(2_000_000, huf), '2 M Ft')
  assert.equal(shortMoney(1_250_000, usd), '$1.25 M')
})

test('approxMoney rounds to 100 above 100 k, to 10 above 10 k', () => {
  assert.equal(approxMoney(465_849, huf), '≈ ' + huf(465_800))
  assert.equal(approxMoney(12_347, huf), '≈ ' + huf(12_350))
  assert.equal(approxMoney(2_641_000, huf), '≈ 2.64 M Ft')
})

test('compactNumber, relativeDay, inDays, originalAmount', () => {
  assert.equal(compactNumber(400_000), '400 k')
  assert.equal(compactNumber(1_240_000), '1.2 M')
  assert.equal(compactNumber(850), '850')
  assert.equal(relativeDay('2026-10-14', '2026-10-14'), 'today')
  assert.equal(relativeDay('2026-10-13', '2026-10-14'), 'yesterday')
  assert.equal(relativeDay('2026-09-12', '2026-10-14'), '12 Sep')
  assert.equal(inDays(0), 'today'); assert.equal(inDays(1), 'tomorrow'); assert.equal(inDays(16), 'in 16 days')
  assert.equal(originalAmount(12_000, 'THB'), '12 000 THB')
  assert.equal(originalAmount(10.99, 'USD'), '10.99 USD')
})
