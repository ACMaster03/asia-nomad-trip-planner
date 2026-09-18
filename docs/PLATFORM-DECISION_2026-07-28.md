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

---

## Amendment — 2026-09-18: SwiftUI re-affirmed, Flutter declined

Raised again because iOS matters (both of us carry iPhones) and cross-platform toolkits had
never been weighed explicitly — only React Native had, above.

**Flutter buys the one thing we already have.** Its value is a single codebase for iOS and
Android; Android is served by the TWA in ~1 day for $25. Using Flutter properly would mean
*replacing* a working Android target with a second app to maintain — more work, not less, and
Dart as a third language beside TypeScript and SQL.

Point by point, for this app rather than in general:

| | SwiftUI | Flutter |
|---|---|---|
| Sign in with Apple | first-class; it is a launch priority | plugin wrapper |
| Maps | MapKit — native, free, satellite, zoomable | Apple Maps only through community platform views; the trodden path is Google Maps, i.e. the bill declined on 2026-09-18 |
| Widgets, Live Activities | native | **WidgetKit is SwiftUI-only.** A Flutter app that wants them contains Swift anyway |
| Supabase | official Swift SDK | official Flutter SDK — genuinely a wash |
| Machine state | Xcode 26.6, Swift 6.3.3, fastlane match, $99 paid | the same Xcode, signing and review friction, plus another toolchain |

The widgets row settles it: a Live Activity reading "3 days in Hanoi, next stop Da Nang" is
exactly what this app wants on a lock screen, and it is SwiftUI whatever wraps the rest.

The deeper reason is the one already recorded above for React Native: the iOS app is a
**4-tab companion, a quarter of the surface, deliberately different from web**. When sharing
was never the prize, a framework selling sharing has nothing to offer.

Also rejected again, for the record: Capacitor or any wrapper around the PWA (Guideline 4.2,
and RSC + middleware rule out a static export), and Compose Multiplatform (non-native
rendering, smaller ecosystem, same downside as Flutter).

### The open question is timing, not language

As of this date **no Swift exists** — no Xcode project, no `Package.swift`, nothing in git
history — and the "both stores before Aug 31 2026" target has passed. The estimate above stands:
several weeks for the companion, months for parity.

Weigh that against what the PWA already does on our own phones: installed to the home screen,
and since iOS 16.4 receiving web push, which the notification matrix (migration 37) already
sends. What the native app adds beyond that is Sign in with Apple, widgets and Live Activities,
background location, genuine offline, and App Store presence. Those are real; they are also
several weeks that currently compete with everything else on the roadmap.

**Decision: the platform choice stands (SwiftUI). The schedule is deliberately left open.**

### What crosses from web to iOS, and what does not

Learned while planning the map work on 2026-09-18, and worth stating because it is easy to
assume a fix list ports:

* **Features in the schema travel.** `my_following()`, `followed_trip_summary`, the per-city
  OSM places layer, meet-up overlaps and a `via` on a transport leg are all read through the
  same RLS by any client. This is the shared contract the table above already names.
* **Fixes in the renderer do not.** Auto-rotate, invisible polygon hit-targets and zoom clamps
  are globe.gl artefacts with no MapKit counterpart. Three of the eight map fixes carry as
  *decisions* — a tapped place must keep its identity, the route outranks hazards, remote feeds
  are cached and timed out — and the rest simply do not exist natively.
* **MapKit is free detail.** The zoom-detail problem that costs $20–25/month in tiles on web is
  solved on iOS by the platform, at no cost. The reverse is also true: the solar terminator is a
  WebGL shader with no MapKit equivalent, so on iOS it is its own work or it is absent.
