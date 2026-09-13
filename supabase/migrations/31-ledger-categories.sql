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
  ('food', 'food', false), ('meal', 'food', false), ('meals', 'food', false), ('restaurant', 'food', false), ('restaurants', 'food', false),
  ('eating out', 'food', false), ('lunch', 'food', false), ('dinner', 'food', false), ('breakfast', 'food', false), ('snacks', 'food', false),
  ('airport (food, drinks)', 'food', false),
  -- drinks
  ('drinks', 'drinks', false), ('drink', 'drinks', false), ('coffee', 'drinks', false), ('beer', 'drinks', false), ('bar', 'drinks', false),
  ('juice', 'drinks', false), ('tea', 'drinks', false),
  -- groceries
  ('groceries', 'groceries', false), ('grocery', 'groceries', false), ('supermarket', 'groceries', false), ('market', 'groceries', false),
  -- convenience
  ('convenience', 'convenience', false), ('convenience store', 'convenience', true), ('7 eleven', 'convenience', false),
  ('7-eleven', 'convenience', false), ('7eleven', 'convenience', false), ('seven eleven', 'convenience', false),
  ('family mart', 'convenience', false), ('familymart', 'convenience', false), ('lawson', 'convenience', false),
  -- stays
  ('stays', 'stays', false), ('stay', 'stays', false), ('accommodation', 'stays', false), ('hotel', 'stays', false), ('hostel', 'stays', false),
  ('airbnb', 'stays', false), ('rent', 'stays', false), ('booking', 'stays', false),
  -- transport (between cities)
  ('transport', 'transport', false), ('flight', 'transport', false), ('flights', 'transport', false), ('train', 'transport', false),
  ('trains', 'transport', false), ('bus', 'transport', false), ('ferry', 'transport', false), ('plane', 'transport', false),
  ('intercity', 'transport', false),
  -- local-transport
  ('local-transport', 'local-transport', false), ('getting around', 'local-transport', true), ('local transport', 'local-transport', false),
  ('public transport', 'local-transport', false), ('taxi', 'local-transport', false), ('grab', 'local-transport', false),
  ('tuktuk', 'local-transport', false), ('tuk-tuk', 'local-transport', false), ('tuk tuk', 'local-transport', false),
  ('metro', 'local-transport', false), ('bts', 'local-transport', false), ('mrt', 'local-transport', false),
  ('scooter', 'local-transport', false), ('bolt', 'local-transport', false),
  -- activities
  ('activities', 'activities', false), ('activity', 'activities', false), ('attraction', 'activities', false), ('attractions', 'activities', false),
  ('tour', 'activities', false), ('tours', 'activities', false), ('sightseeing', 'activities', false), ('museum', 'activities', false),
  ('temple', 'activities', false), ('entry', 'activities', false), ('ticket', 'activities', false), ('tickets', 'activities', false),
  ('entertainment', 'activities', false), ('concert', 'activities', false), ('concerts', 'activities', false),
  ('cinema', 'activities', false), ('nightlife', 'activities', false), ('skz concert tickets', 'activities', false),
  -- health
  ('health', 'health', false), ('pharmacy', 'health', false), ('doctor', 'health', false), ('medicine', 'health', false),
  ('medical', 'health', false), ('massage', 'health', false), ('dentist', 'health', false),
  -- personal-care
  ('personal-care', 'personal-care', false), ('personal care', 'personal-care', true), ('drogerie', 'personal-care', false),
  ('drugstore', 'personal-care', false), ('skincare', 'personal-care', false), ('face care', 'personal-care', false),
  ('toiletries', 'personal-care', false), ('beauty', 'personal-care', false), ('watsons', 'personal-care', false),
  ('haircut', 'personal-care', false), ('laundry', 'personal-care', false),
  -- clothes
  ('clothes', 'clothes', false), ('clothing', 'clothes', false), ('shoes', 'clothes', false),
  -- shopping
  ('shopping', 'shopping', false), ('accessories', 'shopping', false), ('accessory', 'shopping', false), ('souvenir', 'shopping', false),
  ('souvenirs', 'shopping', false), ('gift', 'shopping', false), ('gifts', 'shopping', false),
  -- gear (trip kit bought as one-offs)
  ('gear', 'gear', false), ('equipment', 'gear', false), ('backpack', 'gear', false), ('luggage', 'gear', false), ('electronics', 'gear', false),
  ('adapter', 'gear', false), ('charger', 'gear', false), ('trip gear', 'gear', false), ('kit', 'gear', false), ('one-off', 'gear', false),
  ('one off', 'gear', false), ('extras', 'gear', false),
  -- connectivity
  ('connectivity', 'connectivity', false), ('phone & internet', 'connectivity', true), ('e-sim', 'connectivity', false),
  ('esim', 'connectivity', false), ('sim', 'connectivity', false), ('sim card', 'connectivity', false), ('internet', 'connectivity', false),
  ('phone', 'connectivity', false), ('data', 'connectivity', false), ('wifi', 'connectivity', false),
  -- subscriptions
  ('subscriptions', 'subscriptions', false), ('subscription', 'subscriptions', false), ('netflix', 'subscriptions', false),
  ('spotify', 'subscriptions', false), ('icloud', 'subscriptions', false),
  -- insurance & visas
  ('insurance', 'insurance', false), ('insurance & visas', 'insurance', true), ('travel insurance', 'insurance', false),
  ('visa', 'insurance', false), ('visas', 'insurance', false), ('visa fee', 'insurance', false), ('permit', 'insurance', false),
  -- fees
  ('fees', 'fees', false), ('fees & cash', 'fees', true), ('fee', 'fees', false), ('atm', 'fees', false), ('atm fee', 'fees', false),
  ('bank fee', 'fees', false), ('exchange', 'fees', false),
  -- giving
  ('giving', 'giving', false), ('charity', 'giving', false), ('donation', 'giving', false), ('donations', 'giving', false),
  ('tip', 'giving', false), ('tips', 'giving', false),
  -- other
  ('other', 'other', false), ('misc', 'other', false), ('miscellaneous', 'other', false), ('(uncategorised)', 'other', false),
  ('uncategorised', 'other', false), ('uncategorized', 'other', false), ('cash expense', 'other', false),
  -- income
  ('salary', 'salary', false), ('wage', 'salary', false), ('wages', 'salary', false), ('payroll', 'salary', false),
  ('freelance', 'freelance', false), ('client work', 'freelance', false), ('contract', 'freelance', false), ('invoice', 'freelance', false),
  ('savings', 'savings', false), ('savings brought in', 'savings', true), ('total wealth', 'savings', false),
  ('starting balance', 'savings', false), ('opening balance', 'savings', false), ('transfer in', 'savings', false),
  ('refund', 'refund', false), ('refunds', 'refund', false), ('cashback', 'refund', false), ('reimbursement', 'refund', false),
  ('other-income', 'other-income', false), ('other income', 'other-income', true), ('misc income', 'other-income', false),
  ('gift received', 'other-income', false)
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
