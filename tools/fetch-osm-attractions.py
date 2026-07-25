#!/usr/bin/env python3
"""Fetch OSM visitor attractions per country into CSV for public.geo_places.

    python3 tools/fetch-osm-attractions.py /tmp/osm            # all trip countries
    python3 tools/fetch-osm-attractions.py /tmp/osm TH VN      # just these

Source: OpenStreetMap contributors, licensed ODbL 1.0 — attribution is REQUIRED
wherever this data is shown, and the share-alike clause applies to any derived
database that is published.

SCOPE, decided 2026-07-25 with measured counts: attractions only. Thailand alone
has 19 456 amenity=restaurant nodes vs 2 781 tourism=attraction, and a restaurant
reduced to a name and a coordinate — no hours, photos or reviews — is weaker than
just opening a map app. Attractions are stable, and they are the useful half.

RESUMABLE AND POLITE. Overpass is a shared free service: one country per request,
sleeps between them, retries with backoff, and a country whose CSV already exists
is skipped. Re-running after a rate-limit picks up where it stopped.
"""
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = 'https://overpass-api.de/api/interpreter'
COUNTRIES = ['AT', 'BD', 'CN', 'HK', 'ID', 'IN', 'JP', 'KH', 'KR', 'LA',
             'LK', 'MY', 'NP', 'PH', 'SG', 'TH', 'TW', 'VN']

# Visitor-facing tourism values only. Deliberately excludes hotel/guest_house
# (accommodation is planned in the app, not browsed) and information//picnic
# noise that would swamp the genuinely interesting rows.
KINDS = ['attraction', 'museum', 'viewpoint', 'artwork', 'zoo', 'theme_park', 'gallery']

PAUSE_BETWEEN = 25   # seconds between countries
MAX_RETRIES = 4


# Hong Kong and Macau are SARs, not admin_level=2 areas, so the usual selector
# silently matches nothing and returns a valid empty result. Anything listed here
# drops the admin_level filter.
NO_ADMIN_LEVEL = {'HK', 'MO'}

# Countries too large for one Overpass query — measured 2026-07-25, both fail
# with "Query timed out after 181 seconds" however many times you retry. Each is
# fetched as a grid of bbox tiles INTERSECTED with the country area, so the tiles
# stay inside the border and never pick up a neighbour's POIs.
# (south, west, north, east), generously padded.
TILED = {
    'CN': (17.0, 73.0, 54.0, 135.5),
    'IN': (6.0, 68.0, 36.0, 97.5),
}
TILE_GRID = 3   # 3x3 = 9 queries per tiled country


def query_for(iso2: str, bbox=None) -> str:
    kinds = '|'.join(KINDS)
    area = f'area["ISO3166-1"="{iso2}"]' + ('' if iso2 in NO_ADMIN_LEVEL else '[admin_level=2]')
    # A tile is applied IN ADDITION to the area, never instead of it.
    box = f'({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]})' if bbox else ''
    # `out center` gives ways/relations a representative point, so an attraction
    # mapped as a building is not lost.
    return f'''[out:json][timeout:180];
{area}->.a;
(
  node["tourism"~"^({kinds})$"]["name"](area.a){box};
  way["tourism"~"^({kinds})$"]["name"](area.a){box};
  relation["tourism"~"^({kinds})$"]["name"](area.a){box};
);
out center tags;'''


def tiles_for(iso2: str):
    """Bounding boxes to split an oversized country into, or [None] for one query."""
    if iso2 not in TILED:
        return [None]
    s, w, n, e = TILED[iso2]
    dlat, dlng = (n - s) / TILE_GRID, (e - w) / TILE_GRID
    return [(s + r * dlat, w + c * dlng, s + (r + 1) * dlat, w + (c + 1) * dlng)
            for r in range(TILE_GRID) for c in range(TILE_GRID)]


def fetch_one(iso2: str, bbox) -> list:
    body = urllib.parse.urlencode({'data': query_for(iso2, bbox)}).encode()
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(ENDPOINT, data=body,
                                         headers={'User-Agent': 'asia-nomad-planner/1.0'})
            with urllib.request.urlopen(req, timeout=300) as r:
                payload = json.load(r)
            # Overpass answers 200 with a `remark` when a query runs out of time
            # or memory. Treating that as "no results" is how CN and IN looked
            # like empty countries instead of failed ones.
            if 'remark' in payload:
                raise TimeoutError(f"overpass remark: {payload['remark'][:120]}")
            return payload.get('elements', [])
        except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
            wait = 30 * attempt
            print(f'    {iso2} attempt {attempt}/{MAX_RETRIES} failed ({e}); waiting {wait}s')
            time.sleep(wait)
    return []


def main() -> None:
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '/tmp/osm'
    wanted = [c.upper() for c in sys.argv[2:]] or COUNTRIES
    os.makedirs(out_dir, exist_ok=True)

    for i, iso2 in enumerate(wanted):
        path = os.path.join(out_dir, f'{iso2}.csv')
        if os.path.exists(path):
            print(f'{iso2}: already fetched, skipping')
            continue
        boxes = tiles_for(iso2)
        print(f'{iso2}: fetching…' + (f' ({len(boxes)} tiles)' if len(boxes) > 1 else ''), flush=True)
        els, failed = [], 0
        for bi, box in enumerate(boxes):
            got = fetch_one(iso2, box)
            if not got and box is not None:
                failed += 1
                print(f'    {iso2} tile {bi + 1}/{len(boxes)}: nothing')
            els.extend(got)
            if box is not None and bi < len(boxes) - 1:
                time.sleep(8)
        if failed:
            print(f'{iso2}: {failed}/{len(boxes)} tiles empty or failed')
        # De-duplicate: a way can straddle two tiles.
        seen_ids, uniq = set(), []
        for e in els:
            k = (e.get('type'), e.get('id'))
            if k in seen_ids:
                continue
            seen_ids.add(k)
            uniq.append(e)
        els = uniq
        if not els:
            print(f'{iso2}: NOTHING RETURNED — rerun to retry this country')
            continue
        rows = 0
        # Write to a temp name first so an interrupted run never leaves a
        # half-file that the skip-check would treat as complete.
        tmp = path + '.part'
        with open(tmp, 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            for e in els:
                tags = e.get('tags') or {}
                name = (tags.get('name') or '').strip()
                if not name:
                    continue
                lat = e.get('lat') or (e.get('center') or {}).get('lat')
                lng = e.get('lon') or (e.get('center') or {}).get('lon')
                if lat is None or lng is None:
                    continue
                w.writerow([e.get('type'), e.get('id'), name,
                            tags.get('tourism'), iso2, lat, lng])
                rows += 1
        os.rename(tmp, path)
        print(f'{iso2}: {rows} attractions')
        if i < len(wanted) - 1:
            time.sleep(PAUSE_BETWEEN)

    # Merge into one CSV for \copy
    merged = os.path.join(out_dir, 'geo_places.csv')
    total = 0
    with open(merged, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['osm_type', 'osm_id', 'name', 'kind', 'country_code', 'lat', 'lng'])
        seen = set()
        # SARs FIRST. China's OSM area includes Hong Kong and Macau, so CN's
        # tiles capture their POIs too; merging CN first would let the dedupe
        # drop HK's own rows and label all 620 of them "CN". Whoever is merged
        # first wins the label, so the more specific territory goes first.
        order = sorted(COUNTRIES, key=lambda c: (c not in NO_ADMIN_LEVEL, c))
        for iso2 in order:
            path = os.path.join(out_dir, f'{iso2}.csv')
            if not os.path.exists(path):
                continue
            with open(path, encoding='utf-8') as src:
                for row in csv.reader(src):
                    key = (row[0], row[1])
                    if key in seen:   # a border relation can appear in two countries
                        continue
                    seen.add(key)
                    w.writerow(row)
                    total += 1
    print(f'\n{merged}: {total} rows')


if __name__ == '__main__':
    main()
