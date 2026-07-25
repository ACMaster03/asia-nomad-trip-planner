#!/usr/bin/env python3
"""Regenerate product/src/lib/catalogue/countryCurrencies.ts from mledoze/countries.

    curl -sL https://raw.githubusercontent.com/mledoze/countries/master/countries.json \
      -o /tmp/mledoze.json && python3 tools/gen-country-currencies.py /tmp/mledoze.json

Source data is ODbL 1.0 — keep the attribution header in the generated file.
Only ISO2 + lowercased COMMON names are indexed; official names doubled the file
and duplicated the inverse lookup ("Cambodia, Kingdom Of Cambodia").
"""
import json
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mledoze.json'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'product',
                   'src', 'lib', 'catalogue', 'countryCurrencies.ts')

HEADER = '''// Country -> currency codes. Auto-generated from mledoze/countries, do NOT hand-edit.
// Regenerate with tools/gen-country-currencies.py
//
// Data (c) mledoze/countries contributors, licensed ODbL 1.0:
//   https://github.com/mledoze/countries  https://opendatacommons.org/licenses/odbl/1-0/
//
// WHY VENDORED AND NOT FETCHED: the new-country banner has to fire the instant a
// stop is saved, offline included. A compile-time constant does that with no
// query, no cache and no failure mode. These values change roughly once a decade.
//
// NOT 1:1 - 20 countries use several currencies (Cambodia genuinely runs on both
// KHR and USD), so every value is an array and all of them join the watchlist.
//
// Keys are BOTH ISO-3166 alpha-2 (uppercase) and lowercased COMMON country names,
// because trip segments store the country as a display name. Official names are
// deliberately absent. Always look up via countryCurrencies().

export const COUNTRY_CURRENCIES: Record<string, readonly string[]> = {
'''

MID = '''}

/** ISO2 -> common country name, for the inverse lookup and banner copy. */
const COUNTRY_NAME: Record<string, string> = {
'''

TAIL = '''}

/** Currencies used by a country, given an ISO2 code or a country name. Empty if unknown. */
export function countryCurrencies(countryOrIso: string | undefined | null): readonly string[] {
  if (!countryOrIso) return []
  const raw = countryOrIso.trim()
  return COUNTRY_CURRENCIES[raw.toUpperCase()] ?? COUNTRY_CURRENCIES[raw.toLowerCase()] ?? []
}

// Built on first use rather than shipped: the inverse is the same data again, and
// only the Settings panel ever needs it.
let inverse: Map<string, string[]> | null = null

/** Countries using a currency, by common name. Powers the "also accepted in" line. */
export function currencyCountries(code: string): string[] {
  if (!inverse) {
    inverse = new Map()
    for (const [iso2, name] of Object.entries(COUNTRY_NAME)) {
      for (const c of COUNTRY_CURRENCIES[iso2] ?? []) {
        const list = inverse.get(c) ?? []
        list.push(name)
        inverse.set(c, list)
      }
    }
    for (const list of inverse.values()) list.sort()
  }
  return inverse.get(code) ?? []
}

// ISO2 for a country name — powers flags in search results and the city picker.
// Built from the same table, so it covers all 246 countries offline, not just
// the 18 in the curated catalogue.
let byName: Map<string, string> | null = null

export function countryIso2(name: string | undefined | null): string | null {
  if (!name) return null
  const raw = name.trim()
  if (/^[A-Za-z]{2}$/.test(raw) && COUNTRY_NAME[raw.toUpperCase()]) return raw.toUpperCase()
  if (!byName) {
    byName = new Map()
    for (const [iso2, n] of Object.entries(COUNTRY_NAME)) byName.set(n.toLowerCase(), iso2)
  }
  return byName.get(raw.toLowerCase()) ?? null
}

/** Emoji flag for a country name. Falls back to a neutral flag, never empty. */
export function countryFlag(name: string | undefined | null): string {
  const iso = countryIso2(name)
  if (!iso) return '🏳️'
  return iso.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}
'''


# Upstream corrections. mledoze carries some stale multi-currency regimes, which
# matter twice over: they pollute the "also legal tender in" line, and they would
# dump every listed currency into the watchlist of anyone routing through.
#
#   ZW - lists 9 currencies from the 2009-2019 dollarisation era, including the
#        non-ISO code "ZWB". Zimbabwe introduced ZiG (ZWG) in 2024 with USD still
#        in wide everyday use.
OVERRIDES = {
    'ZW': ['USD', 'ZWG'],
}


def main():
    data = json.load(open(SRC))
    currencies, names = {}, {}
    for c in data:
        codes = sorted((c.get('currencies') or {}).keys())
        if not codes:
            continue  # Antarctica, Bouvet Island, Micronesia, Heard & McDonald
        iso2, common = c['cca2'], c['name']['common']
        codes = OVERRIDES.get(iso2, codes)
        currencies[iso2] = codes
        names[iso2] = common
        currencies.setdefault(common.lower(), codes)

    iso_keys = sorted(k for k in currencies if len(k) == 2 and k.isupper())
    name_keys = sorted(k for k in currencies if not (len(k) == 2 and k.isupper()))
    q = lambda s: json.dumps(s, ensure_ascii=False)
    lit = lambda v: '[' + ', '.join(q(x) for x in v) + ']'

    body = [f'  {k}: {lit(currencies[k])},' for k in iso_keys]
    body += ['', '  // Indexed by name too - trip segments store the country as a display name.']
    body += [f'  {q(k)}: {lit(currencies[k])},' for k in name_keys]
    name_body = [f'  {k}: {q(names[k])},' for k in iso_keys]

    with open(OUT, 'w') as fh:
        fh.write(HEADER + '\n'.join(body) + '\n' + MID + '\n'.join(name_body) + '\n' + TAIL)
    print(f'{os.path.relpath(OUT)}: {os.path.getsize(OUT)} bytes '
          f'({len(iso_keys)} ISO2 + {len(name_keys)} names)')


if __name__ == '__main__':
    main()
