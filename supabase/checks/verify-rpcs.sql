-- Post-apply verification for the privileged RPCs. Read-only.
--   tools/db.sh check
--
-- Every SECURITY DEFINER function runs with its owner's rights, so each one is
-- a hole in RLS that has to be justified. This lists all of them rather than a
-- hardcoded set, so a function added by a future migration shows up here
-- automatically instead of being audited only if somebody remembers.
--
-- What to look for:
--   * anon = t on anything except the deliberately public follow/digest RPCs
--     (shared_*, digest_*) means a signed-out visitor can call it.
--   * an empty `settings` column means search_path is NOT pinned — the
--     injection footgun migration 06 went through and fixed everywhere.

\echo '── every SECURITY DEFINER function in public, with grants ─────────────'
select p.proname                                                 as function,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       coalesce(array_to_string(p.proconfig, ','), '⚠ NOT PINNED') as settings
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.prosecdef
 order by p.proname;

\echo ''
\echo '── the invite/deletion functions specifically (25, 26) ────────────────'
\echo '   all four must be present, definer, authenticated=t, anon=f'
select p.proname                                                 as function,
       p.prosecdef                                               as security_definer,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon',          p.oid, 'execute') as anon
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('pending_invites','accept_invite','decline_invite','delete_my_account')
 order by p.proname;

\echo ''
\echo '── the widened invite guard is installed ──────────────────────────────'
select tgname as trigger, tgenabled as enabled
  from pg_trigger
 where tgrelid = 'public.trip_invites'::regclass
   and not tgisinternal;

\echo ''
\echo '── the four FKs to auth.users that do NOT cascade ─────────────────────'
\echo '   (delete_my_account must clear these by hand; the list should be'
\echo '    exactly: trip_invites.invited_by, trip_invites.accepted_by,'
\echo '    ledger.created_by, cities.owner — anything NEW here is a landmine)'
select c.conrelid::regclass as tbl,
       a.attname            as col,
       c.confdeltype        as on_delete   -- a = no action, c = cascade, n = set null
  from pg_constraint c
  join unnest(c.conkey) k(attnum) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
 where c.contype = 'f'
   and c.confrelid = 'auth.users'::regclass
   and c.connamespace = 'public'::regnamespace
   and c.confdeltype = 'a'
 order by 1, 2;
