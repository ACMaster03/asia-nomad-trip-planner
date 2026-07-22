# 06-security.sql — RLS assertion checklist (run against STAGING)

Run these in the Supabase **SQL Editor** on the staging project, *after* applying
`06-security.sql`. Every block simulates a real signed-in user by setting the JWT
claims inside a transaction and rolling back afterwards — nothing is persisted.

## Setup: pick real UUIDs first

```sql
-- Find your test users and a trip to test against:
select id, email from auth.users;
select id, owner, name, state_rev, ledger_rev from public.trips;
select * from public.trip_members;
```

You need:

| placeholder      | meaning                                              |
|------------------|------------------------------------------------------|
| `:OWNER_ID`      | auth.users.id of the trip owner                      |
| `:VIEWER_ID`     | a user who is a `trip_members` row with role=viewer  |
| `:VIEWER_EMAIL`  | that user's email                                    |
| `:STRANGER_ID`   | a user with **no** membership and no invite          |
| `:TRIP_ID`       | the trip's id                                        |

If no viewer exists yet, create one as a privileged statement (SQL Editor is
privileged; RLS does not apply to it):

```sql
insert into public.trip_members (trip_id, user_id, role)
values (':TRIP_ID', ':VIEWER_ID', 'viewer')
on conflict (trip_id, user_id) do update set role = 'viewer';
```

Impersonation helper — start every test with:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', ':USER_ID', 'email', ':USER_EMAIL', 'role', 'authenticated')::text,
  true);
set local role authenticated;
-- ... test statements ...
rollback;
```

---

## 1. Viewer cannot write the trip document

Impersonate `:VIEWER_ID` / `:VIEWER_EMAIL`.

```sql
-- a) direct update must affect 0 rows (RLS filters it out):
update public.trips set name = 'hacked' where id = ':TRIP_ID';
-- EXPECT: UPDATE 0

-- b) the RPC must refuse cleanly:
select public.write_state(':TRIP_ID', '{}'::jsonb, 'hacked', 0);
-- EXPECT: ERROR 42501 "not allowed to edit this trip"

select public.ledger_upsert_entry(':TRIP_ID', '{"id":"x1","amount":1}'::jsonb);
-- EXPECT: ERROR 42501

select public.ledger_delete_entry(':TRIP_ID', 'x1');
-- EXPECT: ERROR 42501

-- c) viewer CAN still read:
select id, name from public.trips where id = ':TRIP_ID';
-- EXPECT: 1 row
```

Also confirm a viewer cannot write the (unused) child tables:

```sql
insert into public.segments (id, trip_id, city) values ('sg_test', ':TRIP_ID', 'X');
-- EXPECT: ERROR new row violates row-level security policy
```

## 2. Viewer cannot create invites (escalation via second account)

Still impersonating the viewer:

```sql
insert into public.trip_invites (trip_id, email, role, invited_by)
values (':TRIP_ID', 'viewer-alt@example.com', 'editor', ':VIEWER_ID');
-- EXPECT: ERROR row-level security policy violation
```

## 3. Invitee cannot self-escalate

As a privileged statement (no impersonation), create a **viewer** invite for a
fresh test email, e.g. `invitee@example.com` (and a matching auth user
`:INVITEE_ID` — invite the address, then sign the user up, or reuse an
existing user's email):

```sql
insert into public.trip_invites (trip_id, email, role, invited_by)
values (':TRIP_ID', 'invitee@example.com', 'viewer', ':OWNER_ID');
```

Impersonate `:INVITEE_ID` / `invitee@example.com`:

```sql
-- a) joining as editor when invited as viewer must FAIL:
insert into public.trip_members (trip_id, user_id, role)
values (':TRIP_ID', ':INVITEE_ID', 'editor');
-- EXPECT: ERROR row-level security policy violation

-- b) upgrading the invite before accepting must FAIL (trigger guard):
update public.trip_invites set role = 'editor'
 where trip_id = ':TRIP_ID' and lower(email) = 'invitee@example.com';
-- EXPECT: ERROR 42501 "invitees may only accept their own pending invite"

-- c) joining with the invited role must SUCCEED:
insert into public.trip_members (trip_id, user_id, role)
values (':TRIP_ID', ':INVITEE_ID', 'viewer');
-- EXPECT: INSERT 1

-- d) accepting the invite as-is must SUCCEED:
update public.trip_invites
   set status = 'accepted', accepted_by = ':INVITEE_ID', accepted_at = now()
 where trip_id = ':TRIP_ID' and lower(email) = 'invitee@example.com';
-- EXPECT: UPDATE 1
```

## 4. Owner column is frozen

Impersonate `:OWNER_ID` (the owner themselves must not be able to hand off
ownership through the API either):

```sql
update public.trips set owner = ':STRANGER_ID' where id = ':TRIP_ID';
-- EXPECT: ERROR 42501 "trips.owner is immutable"
```

(Privileged contexts — SQL Editor without impersonation — may still change it;
that is intentional, mirroring the is_admin bootstrap pattern.)

## 5. Anon sees nothing

```sql
begin;
select set_config('request.jwt.claims', '', true);
set local role anon;
select count(*) from public.trips;         -- EXPECT: 0
select count(*) from public.trip_members;  -- EXPECT: 0
select count(*) from public.trip_invites;  -- EXPECT: 0
select count(*) from public.profiles;      -- EXPECT: 0
select public.write_state(':TRIP_ID', '{}'::jsonb, null, 0);
-- EXPECT: ERROR permission denied for function write_state
rollback;
```

## 6. Rev conflict returns the typed error (SQLSTATE REV01)

Impersonate `:OWNER_ID` (or any editor):

```sql
select state_rev from public.trips where id = ':TRIP_ID';   -- note the value R

-- correct rev succeeds and bumps:
select public.write_state(':TRIP_ID',
  (select state from public.trips where id = ':TRIP_ID'), null, R);
-- EXPECT: returns R+1

-- stale rev fails distinguishably:
select public.write_state(':TRIP_ID',
  (select state from public.trips where id = ':TRIP_ID'), null, R);
-- EXPECT: ERROR with SQLSTATE 'REV01', message "rev_conflict: expected state_rev R, current is R+1"
```

Ledger merge sanity:

```sql
select public.ledger_upsert_entry(':TRIP_ID', '{"id":"t1","date":"2026-01-01","type":"income","category":"test","amount":1,"currency":"HUF","note":""}'::jsonb);
select public.ledger_upsert_entry(':TRIP_ID', '{"id":"t2","date":"2026-01-02","type":"expense","category":"test","amount":2,"currency":"HUF","note":""}'::jsonb);
select jsonb_array_length(ledger), ledger_rev from public.trips where id = ':TRIP_ID';
-- EXPECT: both t1 and t2 present (no clobbering), ledger_rev bumped twice

select public.ledger_delete_entry(':TRIP_ID', 't1');
select public.ledger_delete_entry(':TRIP_ID', 't2');
-- EXPECT: entries removed again
```

## 7. Profiles visibility

```sql
-- viewer (a co-member) can read the owner's display_name:
--   impersonate :VIEWER_ID →
select display_name from public.profiles where id = ':OWNER_ID';
-- EXPECT: 1 row

-- a stranger cannot:
--   impersonate :STRANGER_ID →
select display_name from public.profiles where id = ':OWNER_ID';
-- EXPECT: 0 rows
```

## 8. App smoke test (after the SQL passes)

1. Open the product app as the owner: edit a stop → saves; add + delete a
   ledger entry → works (these now go through the RPCs).
2. Open the same trip in two browsers, edit the same tab in both quickly →
   the loser shows the "changed elsewhere" banner and refetches instead of
   silently overwriting.
3. Sign in to the static app as a viewer → the cloud button shows read-only
   and no edit persists.

If every EXPECT holds on staging, apply `06-security.sql` to prod and rerun
sections 1, 4, 5 there (they are non-destructive reads/denied writes).
