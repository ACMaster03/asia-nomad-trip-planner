-- ============================================================================
-- 19-fx-rates.sql — M4: FX rates stop being typed by hand.
--
-- Owner decision 2026-07-25: "one bad manual input can mess up trip planning
-- while the data should be correct in all cases." Rates are DATA, not a
-- preference. The only owner controls left are WHICH currencies the trip
-- watches, and WHEN to re-fetch.
--
-- STORED AGAINST A CANONICAL BASE (USD), not against the trip's base currency.
-- The feed is queried with base=USD and its numbers land verbatim: per_usd is
-- "units of this currency per 1 USD". Every pair is then arithmetic —
--     HUF per 1 THB = per_usd['HUF'] / per_usd['THB']
-- so changing the trip's base currency later is a division, not a re-fetch and
-- not a rewrite of stored rows. (base_currency is half-built today: meta
-- .baseCurrency exists but format.ts hardcodes Ft — this leaves that door open.)
--
-- Source: open.er-api.com — no API key, 166 currencies, refreshes ~00:00 UTC.
-- The approved plan rejected Frankfurter explicitly: it lacks VND and KHR.
--
-- ACCURACY, measured 2026-07-25 (do not "fix" this by fetching base=HUF):
--   * The USD table is the PRECISE one. base=HUF reports rates to 6 decimal
--     places, so small values lose resolution — rates['USD'] came back as
--     0.003144, just 4 significant figures. base=USD gave 318.029917, nine.
--   * A genuine ~1% disagreement between the feed's own HUF and USD tables
--     remains for VND after that artefact is removed (26010 vs 26278 VND/USD).
--     That is the source's own inconsistency, not something any storage layout
--     can correct.
--   * Deriving everything from ONE table at least makes the app internally
--     consistent: every screen agrees with every other screen. Mixing bases
--     would leave Budget and Ledger quietly disagreeing.
--   * If VND accuracy ever matters more than free does, swapping the source is
--     a change inside fx-refresh alone — precisely because storage is canonical.
--
-- Idempotent, additive-only. Depends on 03/04 (countries catalogue).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The rate snapshot. One row per currency, overwritten in place — history is
-- not a requirement here (costs are simple inputs, never re-valued after the
-- fact), and a growing table would need pruning nobody would remember to do.
-- ---------------------------------------------------------------------------
create table if not exists public.fx_rates (
  code       text primary key,
  -- units of `code` per 1 USD, exactly as the feed reports it.
  per_usd    numeric not null check (per_usd > 0),
  updated_at timestamptz not null default now()
);

alter table public.fx_rates enable row level security;

-- World data: any signed-in user may read. Writes are service-role only (the
-- fx-refresh function) — deliberately NO insert/update/delete policy, which is
-- what makes "not editable by hand" true at the database level and not just in
-- the UI.
drop policy if exists fx_rates_select on public.fx_rates;
create policy fx_rates_select on public.fx_rates
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Singleton status row: what the Settings panel reads to say "updated 2 hours
-- ago", to go amber past 48h, and to show the real reason a refresh failed.
--
-- last_attempt_at is stamped on EVERY try and drives the manual-refresh rate
-- limit; last_success_at only moves on success, so a run of failures shows as
-- stale rather than quietly looking fresh.
-- ---------------------------------------------------------------------------
create table if not exists public.fx_status (
  id              boolean primary key default true check (id),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error      text,
  source          text,
  currencies      integer
);
insert into public.fx_status (id) values (true) on conflict (id) do nothing;

alter table public.fx_status enable row level security;
drop policy if exists fx_status_select on public.fx_status;
create policy fx_status_select on public.fx_status
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- countries.currency is a single text column, but country -> currency is 1:many:
-- Cambodia genuinely runs on KHR *and* USD, and 20 countries are multi-currency.
-- The watchlist has to add all of them, and the same array inverted answers
-- "which countries accept this currency".
--
-- The old singular column stays for now so nothing that reads it breaks; it is
-- backfilled into the array below and can be dropped once callers move.
-- ---------------------------------------------------------------------------
alter table public.countries add column if not exists currencies text[];

update public.countries
   set currencies = array[currency]
 where currencies is null and currency is not null;

-- ---------------------------------------------------------------------------
-- Daily refresh. pg_cron, NOT a Vercel cron: Hobby allows 2 per day total and
-- two are already spoken for (stay-deadline-alerts 07:00, digest-send 13:00).
--
-- 02:00 UTC: the feed's own next-update stamp lands around 00:00-00:20 UTC, so
-- this clears it comfortably without racing.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('fx-refresh-daily');
exception when others then null; -- not scheduled yet
end $$;

-- URL and secret come from app_config rather than being inlined (as the older
-- jobs did), so this migration applies unchanged to staging and prod.
select cron.schedule(
  'fx-refresh-daily',
  '0 2 * * *',
  $cron$
  select net.http_post(
    url     := (select value from public.app_config where key = 'functions_url') || '/fx-refresh',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select value from public.app_config where key = 'cron_secret')),
    body    := '{}'::jsonb
  );
  $cron$
);
