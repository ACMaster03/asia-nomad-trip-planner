# Social journeys — scope & decision record

How a signed-in traveller comes to see **other people's journeys next to their own**,
and what that does (and deliberately does not do) to the privacy boundary the
follow-link system already defends.

> Status: **scope, not built.** Nothing in this document has been implemented.
> Written 2026-09-15, mid-trip, from a scoping round. The decision log at the
> bottom records *why* each call was made, so the next person does not re-litigate
> them from scratch.

---

## TL;DR

- Most of the "share my trip" product is **already shipped** (migrations 11/16/17/18).
  The gap is narrow: a signed-in user cannot *keep* a followed trip.
- The answer is a **two-tier follower model**: anonymous link-holders read; people
  with accounts read, comment and react, and are individually removable.
- Follows attach to the **trip**, not to the share link. The link is a door, not a
  tether.
- Three phases: **A** (following + merged Home feed) → **B** (followed routes on the
  globe) → **C** (comments, reactions, blocks, notification matrix).
- **Ship A alone first.** ~3 days, and it is the foundation the other two stand on.

---

## 1. What already exists — do not rebuild it

| Capability | Where | State |
|---|---|---|
| No-account follow links | migration 11, `create_share_link`, `/follow/[token]` | shipped |
| Token hashed at rest (256-bit, never re-shown) | migration 11 | shipped |
| Sanitized anon projections | `shared_trip_summary`, `shared_feed` | shipped |
| Pause all links / pause one link / revoke / expire | migration 16, `lib/trips/shares.ts` | shipped |
| Follower email digests (double opt-in) + web push | migrations 16/17, 13 | shipped (Edge Functions **undeployed** — see `NOTES.md`) |
| Realtime "something changed" ping | migration 18 | shipped |
| Co-editor + **viewer** roles, email invites, token invite links | migrations 25/28, `docs/VIEWER-ROLE.md` | shipped |
| Per-account active-trip selection | migration 07 | shipped |
| Account-level push incl. **APNs** transport | migration 27 | shipped |

Two consequences worth stating plainly:

- **"Show one specific person everything" is solved.** That is the `viewer` role —
  full read of stops, stays, transport, extras, Money and Settings, writes refused in
  the database. Invite by email.
- **"Show people something without showing them everything" is solved.** That is the
  share link — route, dates and follower-visible check-ins, nothing else.

The follower projection stays exactly as it is. Check-ins remain the only
follower-visible content. No widening of stays, transport, notes or the ledger.

---

## 2. The two-tier follower model (the core decision)

An anonymous follower **has no identity**. The token is the credential;
`push_subscriptions` is keyed by endpoint and `digest_subscriptions` by email. Eight
people holding one link are indistinguishable to the database.

Every social feature needs a "who" — attribution, per-person removal, "who reacted
with what". So:

| | Reads the journey | Comments & reacts | Removal |
|---|---|---|---|
| **Anonymous link-holder** | yes | **no** | revoke or rotate the link (affects every holder) |
| **Signed-in follower** | yes | yes | **individually blocked** |

This is not a paywall, it is a funnel: grandma reads, the cousin who wants to say
"wow" makes an account.

### Follows attach to the trip, not the share

```sql
create table public.trip_follows (
  user_id       uuid not null references auth.users (id) on delete cascade,
  trip_id       uuid not null references public.trips (id) on delete cascade,
  via_share_id  uuid references public.trip_shares (id) on delete set null, -- provenance only
  nickname      text,
  created_at    timestamptz not null default now(),
  primary key (user_id, trip_id)    -- one user, many followed trips
);

create table public.trip_blocks (
  trip_id       uuid not null references public.trips (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete cascade,
  email         text,               -- catches the trivial second-account re-signup
  created_at    timestamptz not null default now()
);
```

The link is a **door**, not a tether. Walking through it creates a relationship that
then lives on its own. This gives two orthogonal controls instead of one blunt one:

- **Block a person** → `trip_blocks` row, checked by `follow_by_token`. Targeted, no
  collateral damage.
- **Rotate a link** → a new `token_hash` on the **same `trip_shares` row**, so every
  `share_id`-keyed subscription survives and only the URL changes. Use when the *link*
  leaked, not when a *person* misbehaved.

Without the decoupling, a leaked link leaves you playing whack-a-mole with revoke-all
as your only tool.

### ⚠ The load-bearing rule

The follow relationship needs its own predicate — call it `can_follow_trip(t)`:
a non-blocked `trip_follows` row exists for `auth.uid()`.

**`can_follow_trip` must never appear in a table RLS policy.** It authorises the
sanitized follower RPCs and nothing else. `can_view_trip()` gates `segments`, `stays`,
`transport`, `extras`, `notes` **and `ledger`** (see the policy loop in `schema.sql`);
if a future change adds `can_follow_trip` to any of those "for consistency", the entire
privacy model collapses in one line. Put this warning in the migration itself.

### Pause semantics

Migration 16 already has both levels, and they map cleanly:

- **Trip-level pause** (`set_trip_sharing_paused`) → everything dark, account followers
  included.
- **Per-link pause** (`trip_shares.paused_at`) → that link's holders only. Account
  followers are unaffected, because they are no longer tethered to it.

---

## 3. Phase A — following + merged Home feed

**~2.5–3 days. Ship this alone.**

### Backend (one migration)

`trip_follows`, `trip_blocks`, plus:

| RPC | Purpose |
|---|---|
| `follow_by_token(token, nickname)` | the only place a raw token is hashed; refuses blocked users and dead tokens |
| `my_follows()` | the whole list in **one** call — name, current stop, last event, link state |
| `followed_trip_summary(trip_id)` | authenticated twin of `shared_trip_summary` |
| `following_feed(limit, before)` | follower-visible events across all followed trips, newest first |
| `unfollow(trip_id)` | plain RLS delete on own row |

`my_follows()` must be a single call. N+1 here is ten round trips on hotel wifi.

The `followed_*` functions share an internal core with the existing `shared_*` ones
rather than duplicating them, or the two projections will drift.

**`following_feed` must not union your own trip's events in SQL.** Your own events come
through the authenticated path with full payloads and all visibilities including private
`'trip'` notes; followed trips come through the sanitized path. Merge the two
time-sorted lists in the client. One SQL projection across two authorization models is
how a private note ends up in a follower's feed.

### Frontend

- `lib/follow/follows.ts` — query layer, mirroring `lib/trips/shares.ts`.
- `/journeys/[trip]` — the read view. `FollowClient.tsx` (474 lines) already renders
  exactly this. **Build it as a deliberate near-copy first**, unify after the current
  trip ends: that file is a live page real family are reading daily.
- **Home** — the existing events card becomes a merged feed (own + followed), each
  followed row labelled by trip nickname.
- **Account** — a "Trips you follow" card beside "Your trips" (`ActiveTripCard`). This
  is the *management* surface, not the consumption one.
- `/follow/[token]` gains a "Save this journey" CTA when a session exists.

### What Phase A deliberately does not do

- No author names in the feed projection. A merged feed is disambiguated by **whose
  trip** a row belongs to, not which traveller posted it. The projection stays
  byte-identical to today, so nothing anon-facing changes mid-trip.
- No change to `fetchTrips` / `resolveActiveTrip`. Because followers never become
  `trip_members`, a followed trip can never become your *active* trip.

---

## 4. Phase B — followed routes on the globe

**~1–1.5 days on top of A.** "Next to your own trip" is only spatially true here.

`followed_trip_summary` already returns `lat`/`lng` baked into each stop, so a followed
route skips the catalogue lookup `buildRoute` does — the adapter is ~15 lines.

The cost is that `Globe.tsx` takes `segments`/`transport`/`cityIdx`/`rates` and builds
its route internally; a second layer means changing its prop contract, on the heaviest
component in the app (it also carries hazards, country panels, legend, fullscreen).

**B-lite** is the shippable version: followed routes as mauve arcs and pins, one toggle
beside hazards, reuse the existing hover card, no new tap panel.

---

## 5. Phase C — comments, reactions, blocks, notifications

**~5–5.5 days. Do not bundle into the A release.** C is the first feature where one
user writes content another user reads: new moderation, abuse, notification and legal
surface. Prove the follow mechanism in testers' hands first.

### Comments

- Account-only to write. **Visible to everyone who can see the check-in** — comments are
  conversation and conversation needs an audience.
- **One level of nesting.** `parent_id` nullable, replies flat under a top-level comment.
  Arbitrary depth costs recursive queries, collapse UI on a 400px phone and ambiguous
  notification fan-out, for no value on "wow that looks great". Open it up later only if
  a real need appears.
- Comment-author names are needed here (from `profiles`) — a *different* projection from
  check-in author names, which stay deferred.

### Reactions

Fixed set of six:

| key | glyph | for |
|---|---|---|
| `heart` | ❤️ | beautiful |
| `laugh` | 😂 | funny |
| `wow` | 😮 | astonishing |
| `clap` | 👏 | milestones |
| `fire` | 🔥 | the grind — a 14-hour bus, a 5am summit |
| `care` | 🥹 | affection at distance |

- **Store the stable key, never the emoji character.** This is what keeps the set
  re-skinnable and makes a seventh key a migration plus a UI row.
- No reactions on comments. It makes the parent polymorphic (event *or* comment) for the
  least valuable interaction. Easy to add, hard to remove.
- Six fits one phone row at 44px targets (6×44 = 264px inside a 400px viewport). Seven
  wraps.
- `🥹` renders inconsistently on older Android — a known, accepted cosmetic risk.

**Visibility asymmetry (deliberate):** the reaction *tally* — and who reacted with what —
is visible to **trip members only**. A follower sees only their **own** reaction. This
avoids Instagram popularity dynamics. The UI trap: a follower who taps and sees nothing
change thinks it is broken, so their own state must always reflect back.

### Blocking and link rotation

- Block: `trip_blocks` on `user_id` **and** email. Deletes the follow row and refuses
  re-entry through `follow_by_token`.
- Rotate: new `token_hash` on the same share row. A separate, explicitly confirmed
  action, warning that every existing link dies.
- **Revoking an anonymous link** needs a confirm dialog naming the cost
  ("3 people follow through this link and will lose access"). `fetchShareStats`
  (migration 16) already returns the counts to populate it. Nearly free.
- **No device blocking.** It means browser fingerprinting: you would have to fingerprint
  every anonymous follower continuously to catch one person, it is defeated by a private
  window, and it is covert tracking without consent. Refused on purpose.

### Comments after removal

Removal revokes **access, not history**. The comment stays, attributed. A thread with
holes is more confusing than one containing a comment from someone who left, and
delete-on-removal means a rage-quit destroys half a conversation. The owner gets a
separate per-comment delete — that is the moderation tool, and it ships with a report
path from day one, because user-written content is served to anonymous visitors.

### Notification matrix

Today: **two global booleans** on `profiles` (`notify_deadline_push`,
`notify_event_push`, migration 27). No per-trip or per-type granularity.

Target:

| | My trips | Trips I follow |
|---|---|---|
| New check-in / post | — | ✅ on |
| Comment on a post | ✅ on, opt-out | ❌ never |
| Reply to **my** comment | ✅ on | ✅ on |
| Reaction on my post | ⬜ **off** by default | n/a |

Plus a **per-trip mute** overriding everything for that trip.

The simplification that stops this exploding: **"reply to my comment" follows the
person, not the trip** — one channel cutting across both columns.

This is the **sleeper cost of the whole round** (+1–1.5d): a preference table, a mute
table, a preferences UI, and rewritten routing inside `push-fanout` — an Edge Function
that is *already undeployed*. Invisible in a demo; obvious the first weekend a tester's
phone will not stop buzzing.

---

## 6. Effort

| Phase | Cost | Cumulative |
|---|---|---|
| A — following + merged Home feed | 2.5–3d | 3d |
| B-lite — followed routes on the globe | +1–1.5d | ~4.5d |
| C — comments, reactions, blocks, notifications | +5–5.5d | ~9–10d |

### Timing against the iOS app

The follow RPCs are what the iOS client will consume. Landing them **before** that
client is written means iOS gets following for free; landing them after means a second
integration pass. `user_push_subscriptions` already accepts `transport = 'apns'`
(migration 27), so account-level push for followed journeys is pre-wired.

---

## 7. Decision log

| # | Decision | Why |
|---|---|---|
| 1 | Follower projection stays as-is; no widening to stays/transport/money | Those carry addresses, booking refs and cash position, broadcast near-real-time. Migration 29 exists because a review found leaks *around* this boundary. |
| 2 | Followers never become `trip_members` | `can_view_trip` gates every private table. Widening it re-opens everything 06/29 closed. |
| 3 | Follows attach to the **trip**, not the share | Otherwise a leaked link leaves revoke-all as the only tool. Door, not tether. (Reversed an earlier `share_id` proposal — the tether generated every awkward edge case.) |
| 4 | `can_follow_trip` never appears in table RLS | One "for consistency" edit would collapse the model. |
| 5 | Commenting and reacting require an account | Anonymous followers have no identity: no attribution, no per-person removal, no "who reacted with what". |
| 6 | Comments visible to all who can see the check-in | Invisible comments make threading meaningless and turn the feature into a private inbox. Noise is a *notification* problem. |
| 7 | Reaction tally to trip members only | Avoids Instagram popularity dynamics; the follower still sees their own. |
| 8 | Reaction keys, not glyphs; fixed six | Keeps the set re-skinnable and additive. |
| 9 | One level of comment nesting | 90% of the value at 20% of the debt. |
| 10 | No device fingerprinting | Covert tracking of everyone to catch one person. |
| 11 | Removal revokes access, not history | Threads with holes confuse; rage-quits should not delete conversations. |
| 12 | Merged Home feed merges client-side, not in SQL | Two authorization models must not share one projection. |
| 13 | `/journeys/[trip]` as a near-copy of `FollowClient` first | That file is live and load-bearing for family mid-trip. |
| 14 | Check-in author names deferred | A merged feed is disambiguated by trip, not by traveller. Needed once trips routinely carry more than two people. |

---

## 8. Deferred / filed

| Item | Where |
|---|---|
| Advisor / "editorial" role — a non-travelling reviewer who can comment | issue #6 (low priority, may be overruled) |
| Location-scoped discovery — same city / similar trip, **not** global | issue #7 (low priority; stalker risk, DPIA required) |
| Per-author follow *within* one trip | deferred — the one feature that forces author identity into the feed projection |
| User-configurable reaction sets | deferred — per-trip sets make reactions trip-local and break cross-trip aggregation; the stable-key storage keeps the *additive* path cheap |
| Account-level push for followed journeys | rides `user_push_subscriptions` (migration 27) |

## 9. Known blockers

- **The digest Edge Functions are undeployed** (`docs/NOTES.md`, open since 2026-08-28).
  Phase C rewrites `push-fanout` routing, so this must be resolved first or the
  notification work lands on a function nobody is running.
- **The trip is live.** Departure was 31 Aug; real followers are on real links daily.
  Anything touching `/follow/[token]` or the shared RPCs is a change to production for
  people who cannot report a bug.
