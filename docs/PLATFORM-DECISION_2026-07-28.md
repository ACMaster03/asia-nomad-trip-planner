# Platform decision — 2026-07-28 (amends the approved plan)

**Status:** approved by Patrik, 2026-07-28. **Supersedes** the Expo companion in
[`archive/APPROVED-PLAN_2026-07-10.md`](archive/APPROVED-PLAN_2026-07-10.md) §P1–P2 and the
matching summary in [`CONTEXT-RECOVERY.md`](CONTEXT-RECOVERY.md) §2.

## The decision

| Platform | How | Status |
|---|---|---|
| **Web** | Next.js 16 + Tailwind v4, PWA (serwist) | unchanged — the primary product |
| **Android** | **Trusted Web Activity** (TWA) wrapping the PWA | new |
| **iOS** | **Native SwiftUI app** | new |
| ~~Expo / React Native companion~~ | — | **dropped** |

Target: **both stores before departure (Aug 31 2026)**, subject to the review-latency caveat below.

## Why React Native was dropped

The Expo companion existed to serve iOS + Android from one codebase. Once Android is served by
a TWA and iOS by SwiftUI, it has no remaining job, and dropping it removes React Native,
NativeWind, and the P1 monorepo-extraction *pressure* from the roadmap.

Worth recording so this is not re-litigated: a Next.js UI cannot be "ported" to React Native.
RN renders `View`/`Text` to real UIKit/Android views — there is no DOM, no CSS cascade, no media
queries, flexbox defaults differ, and **32 of the app's 74 components are React Server
Components**, a concept that does not exist in RN. Plus 17 `next/*` imports, `window`/`document`/
`navigator` across 21 files, and `globe.gl` (WebGL on canvas). Any RN target means rewriting the
view layer — which is exactly what the original plan concluded when it rejected Tamagui/RSD.

The clincher is that the planned native app was a **4-tab companion** (Today / Map / Feed /
quick-expense), not the full planner. Even perfect UI sharing would have covered ~a quarter of
the surface — and the quarter that *should* differ most on a phone.

## Why these two targets

**Android → TWA.** Google's officially supported path for shipping a PWA to Play; not a
loophole. Every prerequisite already exists (service worker, `manifest.webmanifest`,
installability, splash, iOS-zoom fix). Needs `bubblewrap` + an `assetlinks.json` on the domain
to verify ownership and hide the URL bar. **~1 day**, mostly Play Console paperwork; **$25
one-time**. Web push works on Android.

Note the asymmetry that drove this: the same wrapper approach is high-risk on Apple
(Guideline 4.2, "minimum functionality") — and worse for us specifically, because the app's
heavy RSC + middleware use rules out a static export, so a wrapper would have to load the
remote URL, the exact shape Apple scrutinises.

**iOS → SwiftUI.** Buys first-class **Sign in with Apple** (a launch priority — see the iOS
dev-machine notes), MapKit, widgets, Live Activities, background location, and genuine offline.
Supabase publishes an official **Swift SDK**, so the data layer is not from scratch.

Machine state as of this decision: **Xcode 26.6**, **Swift 6.3.3**, and the
`KeepYourHabits/apple-certificates` repo (fastlane match) already exist, so Apple Developer
infrastructure and the $99/yr are in place via the Keep Your Habits family.
⚠ **No iOS simulator runtimes are installed** (0 devices) — a one-time multi-GB Xcode download
before anything can run locally.

## What is actually shared

Not components. Three platforms now, so the shared layer is:

1. **The Supabase schema + RLS** — the real cross-platform contract. Every client is a thin
   view over the same policies; this is why the migration/testplan discipline matters more than
   any UI abstraction.
2. **Design tokens** — one platform-neutral source (TS/JSON) that emits **CSS custom properties**
   for web and a **Swift `Color` extension** for iOS, so nobody re-types hex codes. See the
   token decision in the design-system work; three platforms make this *more* valuable, not less.
3. **Nothing else.** Swift reimplements auth, caching, optimistic updates and the query layer.
   That is the honest cost of a native app; it is accepted, not overlooked.

## Costs and the one thing that does not compress

- Android TWA: ~1 day. **SwiftUI 4-tab companion: several weeks.** Full parity: months.
- **App Review is wall-clock time, not build time.** Development velocity on this project has
  been extraordinary, but Apple review (and any rejection round-trip) is calendar latency that
  cannot be compressed. To launch before Aug 31, submission must happen with real slack —
  budget weeks, not days, and submit the iOS build well before the departure freeze.
- TestFlight builds expire after 90 days (already noted in the original plan) — if the iOS app
  ships pre-departure, schedule a mid-trip refresh.
- Play: $25 one-time. Apple: $99/yr, already paid.

## What this does NOT change

The three data regimes, the mock-first design gate, the milestone ordering, and the
"live mode + family follow ship before UI polish" sequencing all stand unchanged.
