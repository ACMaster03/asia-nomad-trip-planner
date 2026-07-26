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

## How someone becomes a viewer (migration 25)

Originally this section documented a hole: `createInvite` wrote a `trip_invites`
row and **nothing anywhere inserted into `trip_members`**, so no co-editor or
viewer could join a trip through the app at all. Migration 25 closes it.

**Inviting** — Settings → *People on this trip*: email plus a role picker
(*Edit the trip* / *View only*). Editors can invite, not just the owner, because
`invites_insert` gates on `can_edit_trip`. Pending invites are listed there and
can be withdrawn. (The onboarding wizard still invites as an editor — at that
point you're adding your travel partner.)

**Accepting** — the invitee signs in with that address and gets a banner above
every app screen (`PendingInvites`, mounted in the `(app)` layout, because an
invite is to a trip you cannot navigate to yet). Accept switches them to the
new trip; Decline clears it.

Three RPCs back it, all `SECURITY DEFINER` because a pending invitee has no
access to the trip yet — `can_view_trip` is false until the membership row
exists, so even the trip's *name* is unreadable to the person being asked to
join it:

| Function | Does |
|---|---|
| `pending_invites()` | invites addressed to your verified email — trip name, role, inviter's display name, nothing more |
| `accept_invite(id)` | inserts the membership row **then** marks the invite accepted |
| `decline_invite(id)` | marks it revoked |

Two things in there are load-bearing:

- **Order.** The membership row must land *before* the status flips.
  `members_insert` authorises the self-insert via `pending_invite_role()`, which
  only sees invites still marked `pending` — flip the status first and the role
  lookup returns null and the insert is refused.
- **The role comes from the invite row, never from an argument**, so accepting
  can't become a way to pick yourself a better role. Migration 25 also widens
  06's `guard_invite_update` trigger by exactly one transition
  (`pending → revoked` by the addressed invitee, i.e. declining) while keeping
  every field-immutability check 06 had — and hoisting them so they now cover
  both transitions rather than only acceptance.

`25-TESTPLAN.sql` asserts all of it against staging: invited-as-viewer joins as
viewer, no self-upgrade, no accepting someone else's invite, double-accept is a
no-op, declined invites are dead, a decline can't fake an acceptance, and
`pending_invites()` tells a bystander nothing.

## Creating a viewer by hand

Still useful for testing without a second email account:

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
