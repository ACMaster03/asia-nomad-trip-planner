#!/usr/bin/env python3
"""Turn the GeoNames dumps into CSVs for public.geo_countries / public.geo_cities.

    cd /tmp
    curl -sLO https://download.geonames.org/export/dump/cities15000.zip
    curl -sLO https://download.geonames.org/export/dump/countryInfo.txt
    unzip -o cities15000.zip
    python3 tools/import-geonames.py /tmp
    # then, per environment:
    \\copy public.geo_countries from '/tmp/geo_countries.csv' csv header
    \\copy public.geo_cities    from '/tmp/geo_cities.csv'    csv header

Source: GeoNames (https://www.geonames.org), licensed CC BY 4.0 — attribution is
required wherever this data is shown. Keep the note in migration 23.

WHY cities15000 (population > 15 000, ~34k rows) and not cities1000 or
allCountries: this is the "does the place exist, and where is it" layer for a
travel app, not a gazetteer. 34k rows is ~3 MB, which sits comfortably inside
the free tier, and it is never downloaded to a client — it is reachable only
through search_cities() (migration 20/23).

The alternatenames column is DROPPED on purpose: it is the bulk of the download
(multi-script transliterations of every name) and search already works from the
primary and ASCII names.
"""
import csv
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
OUT = sys.argv[2] if len(sys.argv) > 2 else SRC

# cities15000.txt column indexes (see the GeoNames readme)
C_ID, C_NAME, C_ASCII = 0, 1, 2
C_LAT, C_LNG = 4, 5
C_FEATURE_CODE = 7
C_COUNTRY = 8
C_ADMIN1 = 10
C_POP = 14
C_TZ = 17

# countryInfo.txt column indexes
K_ISO2, K_ISO3, K_NAME, K_CAPITAL = 0, 1, 4, 5
K_CONTINENT, K_POP = 8, 7


def num(v, cast, default=None):
    try:
        return cast(v)
    except (TypeError, ValueError):
        return default


def main() -> None:
    countries_path = os.path.join(SRC, 'countryInfo.txt')
    cities_path = os.path.join(SRC, 'cities15000.txt')

    valid_iso2 = set()
    out_countries = os.path.join(OUT, 'geo_countries.csv')
    with open(countries_path, encoding='utf-8') as fh, \
            open(out_countries, 'w', newline='', encoding='utf-8') as w:
        out = csv.writer(w)
        out.writerow(['iso2', 'iso3', 'name', 'capital', 'continent', 'population'])
        n = 0
        for line in fh:
            if line.startswith('#') or not line.strip():
                continue
            f = line.rstrip('\n').split('\t')
            if len(f) < 9 or not f[K_ISO2]:
                continue
            valid_iso2.add(f[K_ISO2])
            out.writerow([f[K_ISO2], f[K_ISO3], f[K_NAME], f[K_CAPITAL] or None,
                          f[K_CONTINENT], num(f[K_POP], int, 0)])
            n += 1
    print(f'{out_countries}: {n} countries')

    out_cities = os.path.join(OUT, 'geo_cities.csv')
    with open(cities_path, encoding='utf-8') as fh, \
            open(out_cities, 'w', newline='', encoding='utf-8') as w:
        out = csv.writer(w)
        out.writerow(['geonameid', 'name', 'ascii_name', 'country_code', 'admin1',
                      'lat', 'lng', 'population', 'timezone', 'feature_code'])
        n = skipped = 0
        for line in fh:
            f = line.rstrip('\n').split('\t')
            if len(f) < 18:
                continue
            # A city whose country is not in countryInfo would violate the FK.
            if f[C_COUNTRY] not in valid_iso2:
                skipped += 1
                continue
            out.writerow([
                int(f[C_ID]), f[C_NAME], f[C_ASCII] or f[C_NAME], f[C_COUNTRY],
                f[C_ADMIN1] or None,
                num(f[C_LAT], float), num(f[C_LNG], float),
                num(f[C_POP], int, 0), f[C_TZ] or None, f[C_FEATURE_CODE] or None,
            ])
            n += 1
    print(f'{out_cities}: {n} cities' + (f' ({skipped} skipped: unknown country)' if skipped else ''))


if __name__ == '__main__':
    main()
