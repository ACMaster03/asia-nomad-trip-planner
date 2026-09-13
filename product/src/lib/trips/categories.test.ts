import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CATEGORIES, normalizeCategory, categoryLabel, foldCategory, categoriesFor } from './categories.ts'

test('every real category seen in production (2026-09-12) folds into the registry', () => {
  const seen: Record<string, string> = {
    Food: 'food', Drink: 'drinks', Drinks: 'drinks', '7 eleven': 'convenience', Clothes: 'clothes',
    Transport: 'transport', Health: 'health', Subscription: 'subscriptions', 'Public transport': 'local-transport',
    Accessories: 'accessories', Stays: 'stays', Drogerie: 'personal-care', Attraction: 'activities',
    'Cash expense': 'other', Charity: 'giving', Souvenir: 'souvenirs', 'Total wealth': 'savings', ATM: 'fees',
    Skincare: 'personal-care', 'SKZ concert tickets': 'activities', 'Airport (food, drinks)': 'food',
    'E-sim': 'connectivity', Groceries: 'groceries', '(uncategorised)': 'other',
  }
  for (const [raw, id] of Object.entries(seen)) {
    assert.deepEqual(normalizeCategory(raw), { id, known: true }, raw)
  }
})

test('unknown text is kept (trimmed) and flagged, never silently rebucketed', () => {
  assert.deepEqual(normalizeCategory('  Shanghai airport '), { id: 'Shanghai airport', known: false })
  assert.deepEqual(normalizeCategory(''), { id: '', known: false })
  assert.deepEqual(normalizeCategory(undefined), { id: '', known: false })
})

test('ids, labels and aliases are unique across the registry', () => {
  const all = new Map<string, string>()
  for (const c of CATEGORIES) {
    for (const key of [c.id, c.label.toLowerCase(), ...c.aliases]) {
      assert.equal(foldCategory(key), key, `alias not folded: "${key}" on ${c.id}`)
      const prev = all.get(key)
      assert.ok(!prev || prev === c.id, `"${key}" claimed by both ${prev} and ${c.id}`)
      all.set(key, c.id)
    }
  }
  assert.equal(categoryLabel('food'), 'Food')
  assert.equal(categoryLabel('Weird custom'), 'Weird custom')
  assert.ok(categoriesFor('income').every((c) => c.kind === 'income'))
})

test('migrations 31 + 32, applied in order, carry exactly the alias table of the registry', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const inSql = new Map<string, string>()
  for (const file of ['31-ledger-categories.sql', '32-ledger-categories-souvenirs-accessories.sql']) {
    const sql = readFileSync(join(here, '../../../../supabase/migrations/', file), 'utf8')
    // `delete from public.ledger_category_aliases where id = 'x'` drops a whole bucket …
    for (const m of sql.matchAll(/delete from public\.ledger_category_aliases where id = '([a-z-]+)'/g)) {
      for (const [k, v] of inSql) if (v === m[1]) inSql.delete(k)
    }
    // … and rows look like  ('7 eleven', 'convenience', false)  /  ('getting around', 'local-transport', true)
    for (const m of sql.matchAll(/\('((?:[^']|'')*)',\s*'([a-z-]+)',\s*(?:true|false)\)/g)) {
      inSql.set(m[1].replace(/''/g, "'"), m[2])
    }
  }
  const inTs = new Map<string, string>()
  for (const c of CATEGORIES) for (const key of [c.id, c.label.toLowerCase(), ...c.aliases]) inTs.set(key, c.id)
  for (const [k, v] of inTs) assert.equal(inSql.get(k), v, `SQL is missing or disagrees on "${k}"`)
  for (const [k, v] of inSql) assert.equal(inTs.get(k), v, `SQL has an alias the registry lacks: "${k}"`)
})

test('a category is suggested from the entry name, whole words, longest alias first', async () => {
  const { suggestCategory, groupOf, isEverydayCategory, mostUsedCategories } = await import('./categories.ts')
  assert.equal(suggestCategory('Iced coffee'), 'drinks')
  assert.equal(suggestCategory('Grab to the airport'), 'local-transport')
  assert.equal(suggestCategory('Saily e-SIM 10 GB'), 'connectivity')
  assert.equal(suggestCategory('sim card at the airport'), 'connectivity')
  assert.equal(suggestCategory('Barbecue night'), null) // "bar" must not fire inside a word
  assert.equal(suggestCategory('SKZ tickets'), 'activities')
  assert.equal(suggestCategory('xy'), null)
  assert.equal(suggestCategory('Client invoice', 'income'), 'freelance')
  assert.equal(groupOf('convenience'), 'shops')
  assert.equal(groupOf('gear'), 'other')
  assert.equal(isEverydayCategory('food'), true)
  assert.equal(isEverydayCategory('stays'), false)
  assert.equal(isEverydayCategory('Shanghai airport'), true)
  const led = [
    { type: 'expense' as const, category: 'clothes' }, { type: 'expense' as const, category: 'clothes' },
    { type: 'expense' as const, category: 'health' }, { type: 'income' as const, category: 'salary' },
  ]
  assert.deepEqual(mostUsedCategories(led, 'expense', 4), ['clothes', 'health', 'food', 'drinks'])
  assert.deepEqual(mostUsedCategories(led, 'income', 2), ['salary', 'freelance'])
})
