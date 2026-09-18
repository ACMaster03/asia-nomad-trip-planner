// Ledger categories — a small, EXTENDABLE registry instead of free text.
//
// Owner request (Livhold note, 2026-09-11): "category should be an enum instead
// of a freeform text. The enum should later be extendable to cover more
// categories." Adding a category = adding one row here; nothing else changes.
//
// The ledger stores the `id` (a stable slug). Labels are looked up at render
// time, so a label can be reworded without touching data. Unknown ids (rows
// written before this registry, or by a newer app) render as-is — the registry
// is forward-compatible on purpose.
//
// `aliases` is how the old free-text values (and typos/duplicates of them)
// fold into one bucket: normalizeCategory() maps "Drink" / "Drinks" / "7 eleven"
// onto their canonical id. Migration 31 applies the SAME table to the rows
// already in the database; 32 splits Souvenirs and Accessories back out
// (categories.test.ts asserts the registry equals 31 + 32 applied in order).

export type CategoryKind = 'expense' | 'income'

export interface CategoryDef {
  id: string
  label: string
  kind: CategoryKind
  /** lower-case spellings that fold into this category (ids/labels match implicitly) */
  aliases: readonly string[]
  /** one-line hint for the picker */
  hint?: string
}

export const CATEGORIES: readonly CategoryDef[] = [
  // ---- expenses --------------------------------------------------------
  { id: 'food', label: 'Food', kind: 'expense', hint: 'meals, street food, restaurants',
    aliases: ['food', 'meal', 'meals', 'restaurant', 'restaurants', 'eating out', 'lunch', 'dinner', 'breakfast', 'snacks', 'airport (food, drinks)'] },
  { id: 'drinks', label: 'Drinks', kind: 'expense', hint: 'coffee, beer, juice',
    aliases: ['drink', 'drinks', 'coffee', 'beer', 'bar', 'juice', 'tea'] },
  { id: 'groceries', label: 'Groceries', kind: 'expense', hint: 'supermarket runs',
    aliases: ['groceries', 'grocery', 'supermarket', 'market'] },
  { id: 'convenience', label: 'Convenience store', kind: 'expense', hint: '7-Eleven, FamilyMart, Lawson',
    aliases: ['convenience', 'convenience store', '7 eleven', '7-eleven', '7eleven', 'seven eleven', 'family mart', 'familymart', 'lawson'] },
  { id: 'stays', label: 'Stays', kind: 'expense', hint: 'hotels, Airbnb, rent',
    aliases: ['stays', 'stay', 'accommodation', 'hotel', 'hostel', 'airbnb', 'rent', 'booking'] },
  { id: 'transport', label: 'Transport', kind: 'expense', hint: 'flights, trains, buses between cities',
    aliases: ['transport', 'flight', 'flights', 'train', 'trains', 'bus', 'ferry', 'plane', 'intercity'] },
  { id: 'local-transport', label: 'Getting around', kind: 'expense', hint: 'taxi, Grab, tuk-tuk, metro',
    aliases: ['local transport', 'public transport', 'taxi', 'grab', 'tuktuk', 'tuk-tuk', 'tuk tuk', 'metro', 'bts', 'mrt', 'scooter', 'bolt', 'getting around'] },
  { id: 'activities', label: 'Activities', kind: 'expense', hint: 'tickets, tours, temples, concerts',
    aliases: ['activities', 'activity', 'attraction', 'attractions', 'tour', 'tours', 'sightseeing', 'museum', 'temple', 'entry', 'ticket', 'tickets',
      'entertainment', 'concert', 'concerts', 'cinema', 'nightlife', 'skz concert tickets'] },
  { id: 'health', label: 'Health', kind: 'expense', hint: 'pharmacy, doctor, massage',
    aliases: ['health', 'pharmacy', 'doctor', 'medicine', 'medical', 'massage', 'dentist'] },
  { id: 'personal-care', label: 'Personal care', kind: 'expense', hint: 'drugstore, skincare, toiletries',
    aliases: ['personal care', 'drogerie', 'drugstore', 'skincare', 'face care', 'toiletries', 'beauty', 'watsons', 'haircut', 'laundry'] },
  { id: 'clothes', label: 'Clothes', kind: 'expense', hint: 'clothing and shoes',
    aliases: ['clothes', 'clothing', 'shoes'] },
  { id: 'accessories', label: 'Accessories', kind: 'expense', hint: 'jewellery, sunglasses, hair pins, phone straps',
    aliases: ['accessory', 'jewellery', 'jewelry', 'sunglasses', 'hair pins', 'phone strap'] },
  { id: 'souvenirs', label: 'Souvenirs', kind: 'expense', hint: 'gifts, keepsakes, postcards',
    aliases: ['souvenir', 'gift', 'gifts', 'keepsake', 'postcard', 'postcards'] },
  { id: 'gear', label: 'Gear', kind: 'expense', hint: 'backpacks, electronics, adapters, trip kit',
    aliases: ['gear', 'equipment', 'backpack', 'luggage', 'electronics', 'adapter', 'charger', 'trip gear', 'kit', 'one-off', 'one off', 'extras'] },
  { id: 'connectivity', label: 'Phone & internet', kind: 'expense', hint: 'eSIM, data, wifi',
    aliases: ['connectivity', 'e-sim', 'esim', 'sim', 'sim card', 'internet', 'phone', 'data', 'wifi'] },
  { id: 'subscriptions', label: 'Subscriptions', kind: 'expense', hint: 'the monthly ones from home',
    aliases: ['subscriptions', 'subscription', 'netflix', 'spotify', 'icloud'] },
  { id: 'insurance', label: 'Insurance & visas', kind: 'expense', hint: 'travel insurance, visa fees, permits',
    aliases: ['insurance', 'travel insurance', 'visa', 'visas', 'visa fee', 'permit', 'insurance & visas'] },
  { id: 'fees', label: 'Fees & cash', kind: 'expense', hint: 'ATM, bank and exchange fees',
    aliases: ['fees', 'fee', 'atm', 'atm fee', 'bank fee', 'exchange'] },
  { id: 'giving', label: 'Giving', kind: 'expense', hint: 'donations and tips',
    aliases: ['giving', 'charity', 'donation', 'donations', 'tip', 'tips'] },
  { id: 'other', label: 'Other', kind: 'expense', hint: 'anything else',
    aliases: ['other', 'misc', 'miscellaneous', '(uncategorised)', 'uncategorised', 'uncategorized', 'cash expense'] },
  // ---- income ----------------------------------------------------------
  { id: 'salary', label: 'Salary', kind: 'income', aliases: ['salary', 'wage', 'wages', 'payroll'] },
  { id: 'freelance', label: 'Freelance', kind: 'income', aliases: ['freelance', 'client work', 'contract', 'invoice'] },
  { id: 'savings', label: 'Savings brought in', kind: 'income', hint: 'money moved into the trip pot',
    aliases: ['savings', 'total wealth', 'starting balance', 'opening balance', 'transfer in'] },
  { id: 'refund', label: 'Refund', kind: 'income', aliases: ['refund', 'refunds', 'cashback', 'reimbursement'] },
  { id: 'other-income', label: 'Other income', kind: 'income', aliases: ['other income', 'misc income', 'gift received'] },
]

const byId = new Map(CATEGORIES.map((c) => [c.id, c]))

// One lookup table: every id, label and alias → id. Built once.
const lookup = new Map<string, string>()
for (const c of CATEGORIES) {
  lookup.set(c.id, c.id)
  lookup.set(c.label.toLowerCase(), c.id)
  for (const a of c.aliases) lookup.set(a, c.id)
}

/** The same folding the SQL side does: trim, lower-case, collapse whitespace. */
export const foldCategory = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, ' ')

export const DEFAULT_CATEGORY: Record<CategoryKind, string> = { expense: 'other', income: 'other-income' }

/**
 * Map a raw category string onto a registry id. Unknown text is returned
 * unchanged (trimmed) so a custom category is tolerated rather than lost; the
 * caller decides whether to keep it or fall back to DEFAULT_CATEGORY.
 */
export function normalizeCategory(raw: string | null | undefined): { id: string; known: boolean } {
  const folded = foldCategory(raw ?? '')
  if (!folded) return { id: '', known: false }
  const id = lookup.get(folded)
  return id ? { id, known: true } : { id: raw!.trim(), known: false }
}

export const categoryDef = (id: string): CategoryDef | undefined => byId.get(id)

/** Display label — unknown/custom ids show as typed. */
export const categoryLabel = (id: string): string => byId.get(id)?.label ?? id

export const categoriesFor = (kind: CategoryKind): readonly CategoryDef[] =>
  CATEGORIES.filter((c) => c.kind === kind)

// Categories that are not day-to-day living: bookings and one-offs (gear,
// insurance, the monthly subscriptions from home, bank fees). The
// spending analytics exclude them when measuring a daily burn rate, because a
// 248 000 Ft flight on 31 Aug says nothing about what a day in Bangkok costs.
export const NON_DAILY_CATEGORIES: ReadonlySet<string> = new Set(['stays', 'transport', 'gear', 'insurance', 'subscriptions', 'fees'])

// ---- groups: the five colour families the charts use ----------------------
// Twenty categories are too many colours for a phone-width bar; the chart
// and donut speak in these families and the table underneath spells out the
// individual categories.
export type CategoryGroup = 'food' | 'shops' | 'around' | 'wear' | 'care' | 'fun' | 'other'
export const GROUPS: Record<CategoryGroup, { label: string; color: string }> = {
  food: { label: 'Food & drinks', color: 'var(--ac)' },
  shops: { label: 'Groceries & shops', color: 'var(--catGrocery)' },
  around: { label: 'Getting around', color: 'var(--catDaily)' },
  wear: { label: 'Clothes & accessories', color: 'var(--ac2)' },
  care: { label: 'Health & care', color: 'var(--warn)' },
  fun: { label: 'Activities', color: 'var(--catActivity)' },
  other: { label: 'Other', color: 'var(--ln3)' },
}
export const GROUP_ORDER: readonly CategoryGroup[] = ['food', 'shops', 'around', 'wear', 'care', 'fun', 'other']
const GROUP_OF: Record<string, CategoryGroup> = {
  food: 'food', drinks: 'food',
  groceries: 'shops', convenience: 'shops',
  'local-transport': 'around',
  clothes: 'wear', accessories: 'wear', souvenirs: 'wear',
  health: 'care', 'personal-care': 'care',
  activities: 'fun',
}
export const groupOf = (id: string): CategoryGroup => GROUP_OF[id] ?? 'other'

/** Everyday = feeds the per-day rate. Unknown/custom ids count as everyday. */
export const isEverydayCategory = (id: string): boolean =>
  !NON_DAILY_CATEGORIES.has(id) && (byId.get(id)?.kind ?? 'expense') === 'expense'

// ---- suggestion from the entry's name ---------------------------------------
// "Iced coffee" → drinks, "Grab to the airport" → local-transport. Longest
// alias wins so "sim card" beats "card"; matches are whole words so "bar"
// does not fire inside "barbecue".
const ALIAS_INDEX: { alias: string; id: string; kind: CategoryKind }[] = CATEGORIES.flatMap((c) =>
  [c.label.toLowerCase(), ...c.aliases]
    .filter((a) => a.length >= 3 && !a.startsWith('('))
    .map((alias) => ({ alias, id: c.id, kind: c.kind })),
).sort((a, b) => b.alias.length - a.alias.length)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function suggestCategory(name: string, kind: CategoryKind = 'expense'): string | null {
  const folded = foldCategory(name)
  if (folded.length < 3) return null
  for (const { alias, id, kind: k } of ALIAS_INDEX) {
    if (k !== kind) continue
    if (new RegExp(`(^|[^a-z0-9])${escapeRe(alias)}($|[^a-z0-9])`).test(folded)) return id
  }
  return null
}

// ---- most used, for the chip row ------------------------------------------
// The trip's own top categories first, then a sensible default order so a
// brand-new trip still shows a useful row.
const DEFAULT_ROW: Record<CategoryKind, string[]> = {
  expense: ['food', 'drinks', 'convenience', 'local-transport', 'activities', 'groceries', 'clothes', 'health'],
  income: ['salary', 'freelance', 'savings', 'refund', 'other-income'],
}
export function mostUsedCategories(
  entries: readonly { type: CategoryKind; category: string }[],
  kind: CategoryKind,
  n = 6,
): string[] {
  const counts = new Map<string, number>()
  for (const e of entries) if (e.type === kind && byId.has(e.category)) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  const used = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const out: string[] = []
  for (const id of [...used, ...DEFAULT_ROW[kind]]) {
    if (!out.includes(id)) out.push(id)
    if (out.length === n) break
  }
  return out
}
