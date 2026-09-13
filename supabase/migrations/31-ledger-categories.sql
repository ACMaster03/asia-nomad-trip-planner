-- ===========================================================================
-- 31 — ledger categories: fold the free-text values into the registry ids
-- ===========================================================================
-- The Money form used to take the category as free text, and two weeks on the
-- road produced "Drink" and "Drinks", "7 eleven" next to "Groceries",
-- "Attraction" next to "SKZ concert tickets", and a one-off "Shanghai
-- airport". Owner request (Livhold note, 2026-09-11): make it an enum that can
-- grow later, and merge the typos/duplicates already in the data.
--
-- The registry itself lives in the app — product/src/lib/trips/categories.ts —
-- because that is where the picker, the labels and the analytics need it.
-- This migration carries the SAME alias table (categories.test.ts asserts the
-- two never drift) so the rows already in trips.ledger get the same treatment
-- the app now applies at write time:
--
--   • a known spelling (id, label or alias) becomes the registry id;
--   • when that changes the wording of a row that had NO note of its own, the
--     original text is kept as the note ("7 eleven" stays visible as the row's
--     title instead of turning into a bare "Convenience store");
--   • anything unknown is left exactly as it was and listed in a NOTICE for a
--     human to sort out — nothing is silently rebucketed into "other".
--
-- The fold is exposed as a function so a re-run (or a later data fix) is
-- idempotent: a second call changes nothing and does not bump ledger_rev.
-- No CHECK constraint on the category: the enum is meant to be extendable from
-- app code alone, and a stricter database would turn every new category into a
-- migration.
-- ---------------------------------------------------------------------------

-- 1) The alias table. Operator-maintained; the app never reads it.
create table if not exists public.ledger_category_aliases (
  alias     text primary key,          -- folded spelling: lower, trimmed, single spaces
  id        text not null,             -- registry id (lib/trips/categories.ts)
  canonical boolean not null default false  -- true = this is the registry LABEL, not a synonym
);
alter table public.ledger_category_aliases enable row level security;
revoke all on public.ledger_category_aliases from public, anon, authenticated;

insert into public.ledger_category_aliases (alias, id, canonical) values
  -- food
  ('food', 'food'), ('meal', 'food'), ('meals', 'food'), ('restaurant', 'food'), ('restaurants', 'food'),
  ('eating out', 'food'), ('lunch', 'food'), ('dinner', 'food'), ('breakfast', 'food'), ('snacks', 'food'),
  ('airport (food, drinks)', 'food'),
  -- drinks
  ('drinks', 'drinks'), ('drink', 'drinks'), ('coffee', 'drinks'), ('beer', 'drinks'), ('bar', 'drinks'),
  ('juice', 'drinks'), ('tea', 'drinks'),
  -- groceries
  ('groceries', 'groceries'), ('grocery', 'groceries'), ('supermarket', 'groceries'), ('market', 'groceries'),
  -- convenience
  ('convenience', 'convenience'), ('convenience store', 'convenience', true), ('7 eleven', 'convenience'),
  ('7-eleven', 'convenience'), ('7eleven', 'convenience'), ('seven eleven', 'convenience'),
  ('family mart', 'convenience'), ('familymart', 'convenience'), ('lawson', 'convenience'),
  -- stays
  ('stays', 'stays'), ('stay', 'stays'), ('accommodation', 'stays'), ('hotel', 'stays'), ('hostel', 'stays'),
  ('airbnb', 'stays'), ('rent', 'stays'), ('booking', 'stays'),
  -- transport (between cities)
  ('transport', 'transport'), ('flight', 'transport'), ('flights', 'transport'), ('train', 'transport'),
  ('trains', 'transport'), ('bus', 'transport'), ('ferry', 'transport'), ('plane', 'transport'),
  ('intercity', 'transport'),
  -- local-transport
  ('local-transport', 'local-transport'), ('getting around', 'local-transport', true), ('local transport', 'local-transport'),
  ('public transport', 'local-transport'), ('taxi', 'local-transport'), ('grab', 'local-transport'),
  ('tuktuk', 'local-transport'), ('tuk-tuk', 'local-transport'), ('tuk tuk', 'local-transport'),
  ('metro', 'local-transport'), ('bts', 'local-transport'), ('mrt', 'local-transport'),
  ('scooter', 'local-transport'), ('bolt', 'local-transport'),
  -- activities
  ('activities', 'activities'), ('activity', 'activities'), ('attraction', 'activities'), ('attractions', 'activities'),
  ('tour', 'activities'), ('tours', 'activities'), ('sightseeing', 'activities'), ('museum', 'activities'),
  ('temple', 'activities'), ('entry', 'activities'), ('ticket', 'activities'), ('tickets', 'activities'),
  ('entertainment', 'activities'), ('concert', 'activities'), ('concerts', 'activities'),
  ('cinema', 'activities'), ('nightlife', 'activities'), ('skz concert tickets', 'activities'),
  -- health
  ('health', 'health'), ('pharmacy', 'health'), ('doctor', 'health'), ('medicine', 'health'),
  ('medical', 'health'), ('massage', 'health'), ('dentist', 'health'),
  -- personal-care
  ('personal-care', 'personal-care'), ('personal care', 'personal-care', true), ('drogerie', 'personal-care'),
  ('drugstore', 'personal-care'), ('skincare', 'personal-care'), ('face care', 'personal-care'),
  ('toiletries', 'personal-care'), ('beauty', 'personal-care'), ('watsons', 'personal-care'),
  ('haircut', 'personal-care'), ('laundry', 'personal-care'),
  -- clothes
  ('clothes', 'clothes'), ('clothing', 'clothes'), ('shoes', 'clothes'),
  -- shopping
  ('shopping', 'shopping'), ('accessories', 'shopping'), ('accessory', 'shopping'), ('souvenir', 'shopping'),
  ('souvenirs', 'shopping'), ('gift', 'shopping'), ('gifts', 'shopping'),
  -- gear (trip kit bought as one-offs)
  ('gear', 'gear'), ('equipment', 'gear'), ('backpack', 'gear'), ('luggage', 'gear'), ('electronics', 'gear'),
  ('adapter', 'gear'), ('charger', 'gear'), ('trip gear', 'gear'), ('kit', 'gear'), ('one-off', 'gear'),
  ('one off', 'gear'), ('extras', 'gear'),
  -- connectivity
  ('connectivity', 'connectivity'), ('phone & internet', 'connectivity', true), ('e-sim', 'connectivity'),
  ('esim', 'connectivity'), ('sim', 'connectivity'), ('sim card', 'connectivity'), ('internet', 'connectivity'),
  ('phone', 'connectivity'), ('data', 'connectivity'), ('wifi', 'connectivity'),
  -- subscriptions
  ('subscriptions', 'subscriptions'), ('subscription', 'subscriptions'), ('netflix', 'subscriptions'),
  ('spotify', 'subscriptions'), ('icloud', 'subscriptions'),
  -- insurance & visas
  ('insurance', 'insurance'), ('insurance & visas', 'insurance', true), ('travel insurance', 'insurance'),
  ('visa', 'insurance'), ('visas', 'insurance'), ('visa fee', 'insurance'), ('permit', 'insurance'),
  -- fees
  ('fees', 'fees'), ('fees & cash', 'fees', true), ('fee', 'fees'), ('atm', 'fees'), ('atm fee', 'fees'),
  ('bank fee', 'fees'), ('exchange', 'fees'),
  -- giving
  ('giving', 'giving'), ('charity', 'giving'), ('donation', 'giving'), ('donations', 'giving'),
  ('tip', 'giving'), ('tips', 'giving'),
  -- other
  ('other', 'other'), ('misc', 'other'), ('miscellaneous', 'other'), ('(uncategorised)', 'other'),
  ('uncategorised', 'other'), ('uncategorized', 'other'), ('cash expense', 'other'),
  -- income
  ('salary', 'salary'), ('wage', 'salary'), ('wages', 'salary'), ('payroll', 'salary'),
  ('freelance', 'freelance'), ('client work', 'freelance'), ('contract', 'freelance'), ('invoice', 'freelance'),
  ('savings', 'savings'), ('savings brought in', 'savings', true), ('total wealth', 'savings'),
  ('starting balance', 'savings'), ('opening balance', 'savings'), ('transfer in', 'savings'),
  ('refund', 'refund'), ('refunds', 'refund'), ('cashback', 'refund'), ('reimbursement', 'refund'),
  ('other-income', 'other-income'), ('other income', 'other-income', true), ('misc income', 'other-income'),
  ('gift received', 'other-income')
on conflict (alias) do update set id = excluded.id, canonical = excluded.canonical;

-- 2) The same fold the app applies: trim, lower-case, collapse whitespace.
create or replace function public.fold_category(raw text)
returns text
language sql immutable strict
as $$
  select lower(btrim(regexp_replace(raw, '\s+', ' ', 'g')));
$$;

-- 3) Normalise ONE trip's ledger. Returns the number of entries changed;
--    0 leaves the row (and ledger_rev) untouched, so re-runs are free.
create or replace function public.normalize_ledger_categories(trip uuid)
returns integer
language plpgsql volatile
set search_path = public
as $$
declare
  v_changed integer;
  v_new     jsonb;
begin
  select
    count(*) filter (where a.id is not null and a.id is distinct from e ->> 'category'),
    jsonb_agg(
      case
        when a.id is null or a.id = e ->> 'category' then e
        else e
          || jsonb_build_object('category', a.id)
          -- the original wording survives as the note when the row had none —
          -- unless it was just the registry's own label or id in other casing
          || case
               when coalesce(e ->> 'note', '') = ''
                and not a.canonical
                and public.fold_category(e ->> 'category') <> a.id
               then jsonb_build_object('note', btrim(e ->> 'category'))
               else '{}'::jsonb
             end
      end
      order by x.ord)
    into v_changed, v_new
    from public.trips t
    cross join lateral jsonb_array_elements(t.ledger) with ordinality as x(e, ord)
    left join public.ledger_category_aliases a
           on a.alias = public.fold_category(coalesce(x.e ->> 'category', ''))
   where t.id = trip;

  if v_changed is null or v_changed = 0 then
    return 0;
  end if;

  update public.trips
     set ledger     = v_new,
         ledger_rev = ledger_rev + 1,
         updated_at = now()
   where id = trip;
  return v_changed;
end;
$$;

-- Operator/backend only: an end user could otherwise rewrite any trip's
-- categories through it (SECURITY INVOKER + RLS would stop the UPDATE, but
-- there is no reason to expose it at all).
revoke execute on function public.fold_category(text)                 from public, anon;
revoke execute on function public.normalize_ledger_categories(uuid)   from public, anon, authenticated;
grant  execute on function public.normalize_ledger_categories(uuid)   to service_role;

-- 4) Apply to every trip, and say what was left alone.
do $$
declare
  r          record;
  v_total    integer := 0;
  v_leftover text;
begin
  for r in select id, name from public.trips loop
    v_total := v_total + public.normalize_ledger_categories(r.id);
  end loop;
  raise notice 'migration 31: % ledger entries re-categorised', v_total;

  for r in
    select t.name, string_agg(distinct e ->> 'category', ' | ' order by e ->> 'category') as cats
      from public.trips t
      cross join lateral jsonb_array_elements(t.ledger) e
      left join public.ledger_category_aliases a on a.alias = public.fold_category(coalesce(e ->> 'category', ''))
     where a.id is null
     group by t.name
  loop
    v_leftover := coalesce(v_leftover || E'\n', '') || format('  %s: %s', r.name, r.cats);
  end loop;
  if v_leftover is not null then
    raise notice E'migration 31: categories with no registry match (left as typed):\n%', v_leftover;
  end if;
end;
$$;
