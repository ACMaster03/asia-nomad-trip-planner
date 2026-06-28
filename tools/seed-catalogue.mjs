#!/usr/bin/env node
// ============================================================================
// seed-catalogue.mjs — read the existing cities.json and upsert it into the
// shared Supabase catalogue (public.countries + public.cities).
//
// Idempotent: uses upsert on natural keys (countries.code, cities.(country,city)),
// so re-running re-syncs instead of duplicating.
//
// Run AFTER applying supabase/migrations/03-catalogue.sql.
//
// Uses the SERVICE ROLE key, which bypasses RLS — this is the ONLY safe place to
// use it (a trusted local/CI script, never shipped to the browser).
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node tools/seed-catalogue.mjs
//
// Requires @supabase/supabase-js (already a product/ dependency; or `npm i` here).
// ============================================================================
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES_JSON = join(__dirname, '..', 'cities.json');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

// Service-role client: no session, no token refresh, no URL parsing (server use).
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const raw = JSON.parse(await readFile(CITIES_JSON, 'utf8'));
const { countries = {}, cities = [] } = raw;

// currency + ISO-2 by country (lifted from the app's COUNTRY_META in js/map.js) so
// the catalogue ships with these filled instead of 16 manual admin edits.
const CURRENCY = {
  Thailand: 'THB', Vietnam: 'VND', Indonesia: 'IDR', Malaysia: 'MYR', Cambodia: 'KHR',
  Laos: 'LAK', Singapore: 'SGD', Japan: 'JPY', 'South Korea': 'KRW', Taiwan: 'TWD',
  'Hong Kong': 'HKD', China: 'CNY', India: 'INR', Nepal: 'NPR', 'Sri Lanka': 'LKR',
  Bangladesh: 'BDT',
};
const ISO2 = {
  Thailand: 'TH', Vietnam: 'VN', Indonesia: 'ID', Malaysia: 'MY', Cambodia: 'KH',
  Laos: 'LA', Singapore: 'SG', Japan: 'JP', 'South Korea': 'KR', Taiwan: 'TW',
  'Hong Kong': 'HK', China: 'CN', India: 'IN', Nepal: 'NP', 'Sri Lanka': 'LK',
  Bangladesh: 'BD',
};

// ---- 1) countries -----------------------------------------------------------
// cities.json keys countries by English name; we use that as the stable `code`.
const countryRows = Object.entries(countries).map(([code, c]) => ({
  code,
  name: code,
  iso2: ISO2[code] ?? null,
  currency: CURRENCY[code] ?? null,
  visa: c.visa ?? null,
  best_time: c.bestTime ?? null,
  safety: c.safety ?? null,
  extras: {},          // any future country field lands here
  updated_at: new Date().toISOString(),
}));

// Also ensure every country referenced by a city exists (FK safety), in case a
// city's country is missing from the countries map.
for (const c of cities) {
  if (c.country && !countryRows.some((r) => r.code === c.country)) {
    countryRows.push({
      code: c.country, name: c.country, iso2: ISO2[c.country] ?? null, currency: CURRENCY[c.country] ?? null,
      visa: null, best_time: null, safety: null, extras: {},
      updated_at: new Date().toISOString(),
    });
  }
}

{
  const { error } = await supabase
    .from('countries')
    .upsert(countryRows, { onConflict: 'code' });
  if (error) throw error;
  console.log(`countries: upserted ${countryRows.length}`);
}

// ---- 2) cities --------------------------------------------------------------
// Pull the KNOWN sortable scalars into structured columns; everything else
// (food/transport/internet/landmarks/weather + the nested cost objects) goes
// verbatim into `attributes` so future fields need no schema change.
const cityRows = cities.map((c) => {
  const costs = c.costs ?? {};
  // attributes = the full city object minus the fields we promoted to columns.
  const {
    region, regionName, country, city, lat, lng, // -> columns (dropped from attrs)
    ...rest                                       // food, transport, internet, landmarks, weather, costs, ...
  } = c;
  return {
    country: c.country,
    city: c.city,
    region: c.region ?? null,
    region_name: c.regionName ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    daily_living_mid: costs?.dailyLiving?.mid ?? null,
    accom_mid: costs?.accomPerNight?.mid ?? null,
    rent_monthly: costs?.rentMonthly ?? null,
    attributes: rest,            // keeps costs (incl. allInDayMid), food, weather, landmarks, ...
    updated_at: new Date().toISOString(),
  };
});

{
  const { error } = await supabase
    .from('cities')
    .upsert(cityRows, { onConflict: 'country,city' });
  if (error) throw error;
  console.log(`cities: upserted ${cityRows.length}`);
}

console.log('Done. catalogue_fields are seeded by the SQL migration, not here.');
