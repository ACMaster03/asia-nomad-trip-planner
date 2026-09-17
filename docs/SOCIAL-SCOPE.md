# Social journeys — scope & decision record

How a signed-in traveller comes to see **other people's journeys next to their own**,
and what that does (and deliberately does not do) to the privacy boundary the
follow-link system already defends.

> Status: **Phase A backend written, not applied.** `supabase/migrations/33-social-following.sql`
> and its TESTPLAN exist and passed a rolled-back dry run on staging on 2026-09-16;
> the query layer is in `product/src/lib/follow/follows.ts` + `merge.ts`. The UI is
> mocked for review, not built. Phases B and C are untouched.
>
> **2026-09-17:** migration 33 is on staging. `34-social-interactions.sql` (followers
> list + remove/block, reactions, comments, reports; TESTPLAN green in a rolled-back
> run on staging) is written, not applied. Query layers: `product/src/lib/follow/`.
> Mock round 4 has every question answered; UI build has not started.
>
> **2026-09-17, later:** 34 is on staging. **Phase A UI is built** on branch
> `feat/social-following` from the round-4 mocks: Home activity (merged feed, people
> strip, reaction chips, comment counts), `/post/[id]` and `/follow/[token]/post/[id]`
> (reactions, one-level thread), `/people` (Following/Followers, search, country
> chips, remove/block), `/journeys/[trip]` (follow controls behind the top-right
> sliders), the follow page's "Follow the travellers" card with the account sheet
> for anonymous visitors, the first-check-in nudge on /live, Account's People row and
> per-trip "open to followers" switch. `35-social-post.sql` (single-post readers
> `followed_event` / `shared_event`) is on staging (applied 2026-09-17, testplan green).
> Dev preview: `/dev/social-preview?screen=home|journey|people|post|follow`.
> **33, 34 and 35 are on prod** (applied 2026-09-17, all testplans green). PR #16 carries the UI.
>
> **Model change, 2026-09-16 (Patrik):** follows attach to **people, not trips**.
> Section 2 below is rewritten for that; decision 3 in the log records the reversal.
> Everything else in this document still holds.
> Written 2026-09-15, mid-trip, from a scoping round. The decision log at the
> bottom records *why* each call was made, so the next person does not re-litigate
> them from scratch.

---

## TL;DR

- Most of the "share my trip" product is **already shipped** (migrations 11/16/17/18).
  The gap is narrow: a signed-in user cannot *keep* a followed trip.
- The answer is a **two-tier follower model**: anonymous link-holders read; people
  with accounts read, comment and react, and are individually removable.
- Follows attach to **people**. The trip stays the unit of content, and each trip
  has its own switch that opens it to the travellers' followers. The link is a
  door, not a tether.
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

### Follows attach to people; trips opt in

You follow a **person**, and you keep following them wherever they go next. A trip
is visible to its travellers' followers only while `trips.follower_access` is
`'on'` (the default for a new trip is `'off'`: nothing is broadcast by accident,
and the app nudges at the first check-in — "Show this trip to your 12 followers?").
Trips that already had a live link when migration 33 ran were backfilled to `'on'`.

```sql
alter table public.trips add column follower_access text not null default 'off'
  check (follower_access in ('off','on','paused'));

create table public.user_follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  followee_id  uuid not null references auth.users (id) on delete cascade,
  via_share_id uuid references public.trip_shares (id) on delete set null, -- provenance only
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid references auth.users (id) on delete cascade,
  email      text,               -- catches the trivial second-account re-signup
  created_at timestamptz not null default now()
);
```

The share link is still the **door**: the follow page lists the trip's travellers
(owner + editors, by first name) with everyone preselected, and "Follow" creates one
`user_follows` row per person kept. A parent who only wants their kid's posts unticks
the friends. What a follower then sees on a trip is:

- the **route and dates** of any open trip one of their followees travels on;
- **check-ins and notes by the travellers they follow**;
- **"Arrived in X"** from anyone on the trip — arrivals belong to the trip, not to
  a person.

Trips the follower is themselves a member of are left out of the follower feed:
those already reach Home through the authenticated path.

Two orthogonal controls, same as before but per person:

- **Block a person** → `user_blocks` row, checked by `follow_by_token` and by the
  follower predicate. Targeted, no collateral damage.
- **Rotate a link** → a new `token_hash` on the **same `trip_shares` row**. Use when
  the *link* leaked, not when a *person* misbehaved.

Names: the follower projection shows a traveller's **first name** from the auth
metadata (what the Account "Your name" card writes), otherwise "A traveller". It
never falls back to `profiles.display_name`, which is seeded from the email's local
part. This is the one widening of the anonymous projection: link holders now see
first names too, plus `author`/`authorName` on feed rows. Nothing else moves.

### ⚠ The load-bearing rule

The follow relationship needs its own predicate — `can_follow_trip(t)`: the trip is
not `'off'`, and a non-blocked `user_follows` row exists from `auth.uid()` to one of
its travellers.

**`can_follow_trip` must never appear in a table RLS policy.** It authorises the
sanitized follower RPCs and nothing else. `can_view_trip()` gates `segments`, `stays`,
`transport`, `extras`, `notes` **and `ledger`** (see the policy loop in `schema.sql`);
if a future change adds `can_follow_trip` to any of those "for consistency", the entire
privacy model collapses in one line. Migration 33 revokes EXECUTE on it from
`authenticated` so such a policy fails loudly, and its TESTPLAN asserts it is absent
from `pg_policies`.

### Pause semantics

- **`follower_access = 'paused'`** → the trip goes dark for account followers (page
  says paused, list goes dark, feed stops). The owner's existing "pause sharing"
  switch (`set_trip_sharing_paused`, migration 16) flips `'on'` ↔ `'paused'` as well
  as pausing every link, and leaves `'off'` alone.
- **`'off'`** → the trip is not listed for followers at all; the follows survive.
- **Per-link pause** (`trip_shares.paused_at`) → that link's anonymous holders only.
  Account followers are unaffected: they are not tethered to it.

## 3. Phase A — following + merged Home feed

**~2.5–3 days. Ship this alone.**

### Backend (one migration)

`user_follows`, `user_blocks`, `trips.follower_access`, plus:

| RPC | Purpose |
|---|---|
| `follow_by_token(token, travellers[])` | the only place a raw token is hashed; skips people who blocked the caller; null for dead/paused links |
| `my_following()` | everyone you follow with their open trips in **one** call — current stop, last event, state |
| `followed_trip_summary(trip_id)` | authenticated twin of `shared_trip_summary`, plus which travellers you follow there |
| `following_feed(limit, before)` | posts of the people you follow across their open trips, newest first |
| `set_follower_access(trip, off/on/paused)` | the traveller's per-trip switch |
| `my_follower_count()` | "12 people follow you" |
| unfollow | plain RLS delete on own `user_follows` row |

`my_following()` must be a single call. N+1 here is ten round trips on hotel wifi.

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
  followed row labelled by who posted it and on which trip.
- **Account** — a "People you follow" card beside "Your trips" (`ActiveTripCard`). This
  is the *management* surface, not the consumption one. The sharing card gains the
  per-trip "open to followers" switch and the follower count.
- `/follow/[token]` gains a "Follow the travellers" card when a session exists
  (everyone preselected), and a "create an account" card when none does.
- **First check-in nudge** — when a trip is still `'off'` and the traveller has
  followers, offer to open it.

### What Phase A deliberately does not do

- No widening beyond names. Feed rows carry `author`/`authorName` and the summary
  carries `travellers` (first names) — needed to follow a person — and nothing else
  changes in the anonymous projection mid-trip.
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

- **Store the stable key, never the emoji character.** The available set lives in a
  `reaction_kinds` registry table plus a `lib/trips/reactions.ts` mirror — the same
  pattern migration 31 used to turn ledger categories from free text into a registry.
  Adding a seventh kind is then a registry row, not a schema change, and every stored
  reaction keeps working.
- **Swappable sets are the intended direction, shipping as the fixed six.** Decided
  with the trade-off understood: per-user or per-trip sets mean you render glyphs from
  outside your own set anyway (A reacts `fire`, B removed it, B still has to draw it),
  and trip-local sets break cross-trip aggregation. The registry keeps the door open at
  near-zero cost; revisit when someone actually asks.
- No reactions on comments. It makes the parent polymorphic (event *or* comment) for the
  least valuable interaction. Easy to add, hard to remove.
- Six fits one phone row at 44px targets (6×44 = 264px inside a 400px viewport). Seven
  wraps.
- `🥹` renders inconsistently on older Android — a known, accepted cosmetic risk.

**Visibility asymmetry (deliberate, reconfirmed 2026-09-17):** the reaction *tally* — and who
reacted with what — is visible to **trip members only**. A follower sees only their **own** reaction. This
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

Decided 2026-09-17: "comment on a post" defaults to **my own** check-ins; a per-trip
toggle widens it to every post of the trip. Reaction visibility stays asymmetric
(tally for travellers only) — revisit only on real user pushback.

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
| 3 | Follows attach to **people**; trips opt in with `follower_access` | 2026-09-16, Patrik: a traveller has many trips and followers should not need a new link each time. Reverses the trip-attached model of 09-15 (which itself reversed a `share_id` tether). Default `'off'` per trip so nothing is broadcast by accident; arrivals show trip-wide, posts by followed author only. |
| 4 | `can_follow_trip` never appears in table RLS | One "for consistency" edit would collapse the model. |
| 5 | Commenting and reacting require an account | Anonymous followers have no identity: no attribution, no per-person removal, no "who reacted with what". |
| 6 | Comments visible to all who can see the check-in | Invisible comments make threading meaningless and turn the feature into a private inbox. Noise is a *notification* problem. |
| 7 | Reaction tally to trip members only | Avoids Instagram popularity dynamics; the follower still sees their own. |
| 8 | Reaction keys in a registry table, not glyphs; six to start | Mirrors migration 31's ledger-category registry. Swappable sets are the intended direction; a seventh kind becomes a registry row. |
| 9 | One level of comment nesting | 90% of the value at 20% of the debt. |
| 10 | No device fingerprinting | Covert tracking of everyone to catch one person. |
| 11 | Removal revokes access, not history | Threads with holes confuse; rage-quits should not delete conversations. |
| 12 | Merged Home feed merges client-side, not in SQL | Two authorization models must not share one projection. |
| 13 | `/journeys/[trip]` as a near-copy of `FollowClient` first | That file is live and load-bearing for family mid-trip. |
| 14 | ~~Check-in author names deferred~~ — **first names shipped in 33** | Following a person is impossible without a name. First name from auth metadata, never the profile name (seeded from the email prefix). |

---

## 8. Tracked work

| Issue | Phase | Depends on |
|---|---|---|
| #8 | **A** — following + merged Home feed | — |
| #9 | **B** — followed routes on the globe | #8 |
| #10 | **C1** — comments on check-ins | #8 |
| #11 | **C2** — reactions | #8 |
| #12 | **C3** — blocks + link rotation | #8 |
| #13 | **C4** — notification matrix | #8, #10, #11 |
| #14 | Approval-required follow links (a link mode; base for in-app discovery) | #8 |
| #15 | Close friends layer with delayed release for everyone else | #8, #13 |

## 9. Deferred / filed

| Item | Where |
|---|---|
| Advisor / "editorial" role — a non-travelling reviewer who can comment | #6 (low priority, may be overruled) |
| Location-scoped discovery — same city / similar trip, **not** global | #7 (low priority; stalker risk, DPIA required) |
| ~~Per-author follow *within* one trip~~ | shipped by the person model: untick a traveller on the follow page |
| User-configurable reaction sets | deferred, but **intended** — the `reaction_kinds` registry is designed for it; ships as the fixed six |
| Account-level push for followed journeys | rides `user_push_subscriptions` (migration 27) |

## 10. Known blockers

- ~~The digest Edge Functions are undeployed~~ — **deployed 2026-09-16** (`docs/NOTES.md`).
  Phase C still rewrites `push-fanout` routing; check that function's deploy state
  separately before starting C4.
- **The trip is live.** Departure was 31 Aug; real followers are on real links daily.
  Anything touching `/follow/[token]` or the shared RPCs is a change to production for
  people who cannot report a bug.
