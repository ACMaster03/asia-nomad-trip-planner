import type { Extra } from './types'
import { foldCategory, normalizeCategory } from './categories.ts'

// === One-offs & extras ===
//
// The extras form speaks in its own seven words (Visa, Insurance, Vaccines,
// Gear, Flights (intl), SIM/eSIM, Other) and stores them as typed, while the
// ledger stores registry ids (lib/trips/categories.ts). Until 2026-09-23 the
// two never met: the One-offs card keyed its Planned column by the extra's
// word and its Paid column by the ledger id, so "Insurance" and "insurance"
// were two rows. This is the one bridge, used by BOTH sides of that card and
// by the import that writes an extra's payment row, so they can never
// disagree again.
//
// Three of the seven words have no alias in the registry; they are mapped
// here rather than by adding aliases, because categories.test.ts pins the
// registry to migrations 31 + 32 and a vaccine is a health cost, not a
// category of its own.
const EXTRA_WORDS: Record<string, string> = {
  vaccines: 'health',
  vaccine: 'health',
  'flights (intl)': 'transport',
  'sim/esim': 'connectivity',
}

/** Registry id for an extra's category; unknown words fall back to `other`. */
export function extraCategoryId(raw: string | undefined | null): string {
  const folded = foldCategory(raw ?? '')
  if (!folded) return 'other'
  const mapped = EXTRA_WORDS[folded]
  if (mapped) return mapped
  const n = normalizeCategory(folded)
  return n.known ? n.id : 'other'
}

/** A paid-on date makes the extra a payment; the tick is only about the forecast. */
export const isPaidExtra = (e: Extra): boolean => !!e.paidOn && e.amount > 0
