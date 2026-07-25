# The viewer role (gaps 7 + 8)

Closes the two permission gaps from the M0 walkthrough (`design/SCREENS.md`).

## What the roles mean

| Role | Source of truth | Can |
|---|---|---|
| **owner** | `trips.owner = auth.uid()` | everything, including deleting the trip |
| **editor** | `trip_members` row, `role = 'editor'` | edit the plan and the ledger, manage follow links |
| **viewer** | `trip_members` row, `role = 'viewer'` | read everything; write nothing |
| **none** | no row, no ownership | nothing (RLS hides the trip entirely) |

The database has enforced this since migration 06 — `can_view_trip()` vs
`can_edit_trip()`. Until now **the UI never asked**: `createInvite` hardcoded
`'editor'` and no screen read `trip_members.role`, so a viewer would have seen
the full editing UI with every save bouncing off RLS.

`product/src/lib/trips/role.ts` is the client-side mirror of those two SQL
functions and must stay in agreement with them.

## Where it is enforced

**The boundary is the database, not the UI.** Hiding a button is presentation.
Every read-only state below has a server-side counterpart that refuses the write:

- RLS on `trips` (`trips_update` → `can_edit_trip`)
- the `42501` pre-checks inside `write_state`, `ledger_upsert_entry`,
  `ledger_delete_entry` (migration 06, lines 307/366/406)

The client turns that `42501` into a typed `PermissionDeniedError`
(`queries.ts`), which is what makes **revoke-mid-session** honest: a co-editor
whose access is withdrawn while their tab is open keeps the editable UI until
their next save, which then rolls back, explains itself in the `SaveError`
banner, and re-resolves the role so the screen switches to read-only.

## What a viewer sees

| Screen | Behaviour |
|---|---|
| Stops / Stays / Transport / Extras | rows, totals and the timeline; no add/edit/delete, include-checkboxes disabled, `ViewerNotice` banner |
| Money | all figures, the P&L table and the entry list; no add form, no delete, no cost-import banner |
| Settings | trip meta and FX rates as read-only fields; no Save; no sharing panel; a role chip next to the heading |
| `/live` | **not in the nav, and refused on direct URL** with `NoAccess` — every action on that screen is a write |
| Dashboard / Map / Explore | unchanged; they were already read-only |

Two auto-write side effects are gated too, because they fire on mere *page load*
and would have painted a save-error banner at a viewer who only opened a screen:
the ledger's plan-import sync (`LedgerTab`) and the FX watchlist top-up
(`NewCountryBanner`).

## Failure modes, deliberately chosen

- **Role query pending** → treated as `'unknown'`: no edit buttons *and* no
  read-only banner. Telling someone they are a viewer before finding out they
  are the owner is worse than a beat of missing buttons. The `(app)` layout
  seeds the role server-side, so this only occurs right after a trip switch.
- **Role query failed with nothing cached** → **fail open** (`canEdit` true).
  On the road, an owner losing every edit button to a network blip is a far
  worse failure than a viewer seeing buttons whose writes the DB refuses. The
  `/live` nav item and the `/live` route guard make the same call.

## ⚠️ Known hole: nobody can accept an invite

`createInvite` writes a `trip_invites` row, and migrations 02/06 make joining
role-safe — but **no code anywhere inserts into `trip_members`**. There is no
acceptance UI, so today no co-editor *or* viewer can join a trip through the
app at all. The wizard's step-3 invite records a row that nothing consumes.

This predates the viewer role and is why the role work above cannot yet be
exercised end to end without SQL. Until an acceptance flow exists, create a
viewer by hand:

```sql
-- make an existing user a VIEWER on a trip (run in the SQL editor)
insert into public.trip_members (trip_id, user_id, role)
values (
  '<trip-uuid>',
  (select id from auth.users where email = 'viewer@example.com'),
  'viewer'
)
on conflict (trip_id, user_id) do update set role = excluded.role;
```

Flip `'viewer'` to `'editor'` to test the co-editor path, and `delete` the row
to test the revoked-mid-session banner with the tab left open.
