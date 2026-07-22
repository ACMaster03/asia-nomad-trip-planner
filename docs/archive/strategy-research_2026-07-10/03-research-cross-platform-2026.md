# Report: 2026 Cross-Platform Strategy for Next.js 16 + React 19 + Supabase → Web + iOS + Android

Compiled 2026-07-10 from current (2026) sources. Confidence flags inline. Vendor-authored sources (Capgo, NextNative, MagicBell, Mobiloud) are marketing-adjacent and flagged as such.

---

## 1. Expo (React Native) universal apps in 2026

**SDK state:** Expo SDK 56 released **2026-05-21**, ships React Native 0.85 + React 19.2. SDK 54 is the prior stable baseline. (https://expo.dev/changelog/sdk-56)

**Web output maturity — the key answer:** react-native-web is now called "production-grade" and powers X/Twitter web and MLS, per a June 2026 practitioner article (https://reactnativerelay.com/article/react-native-web-expo-cross-platform-2026, 2026-06-09). BUT that same article is explicit that **web is second-class for content/SEO sites**:
- "For a content-heavy site that needs Lighthouse 100, you'd build with React DOM directly."
- "If your primary product is the website and a mobile app is secondary, use Next.js for the site and a separate React Native app."
- Web is framed as acceptable only when it's a *secondary surface to a primary mobile experience*.

**Expo Router web:** Static rendering (SSR-crawlable HTML) is stable; SDK 56 added streaming SSR behind `unstable_useServerRendering` flag and a `generateMetadata` function for per-route SEO metadata. (https://docs.expo.dev/workflow/web/, https://expo.dev/changelog/sdk-56)

**RSC status:** React Server Components remain a **technical preview / not production-recommended** as of SDK 56. Documented limitations: EAS Update doesn't work with RSC yet; DOM components can't use Server Functions in production; server-rendering RSC payloads to HTML not supported. (https://docs.expo.dev/guides/server-components/)

**DOM components:** Escape hatch for embedding real web components in native. `@expo/dom-webview` is now the default WebView (no more react-native-webview dependency). But DOM components render only as SPAs — no static rendering, no RSC. (https://docs.expo.dev/guides/dom-components/)

**Verdict:** A serious content/SEO web app should **not** be Expo-only in 2026. Expo web is viable as a secondary/app-like surface, not as a primary SEO/content web property. This argues *against* abandoning the existing Next.js web app.

---

## 2. Next.js + Capacitor wrapping

**App Store viability (the real story — vendor claims corrected):** Capgo/NextNative claim wrapped apps ship "without any risk of being rejected" — **treat as marketing spin**. The accurate 2026 picture (Mobiloud, https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper): webview/wrapped apps **can** pass Guideline 4.2, but Apple actively rejects "lazy wrappers." To pass you need genuine native layering:
- Native navigation (native tab bar / headers), not DOM hamburger menus
- Real device-capability use (push notifications called out as essentially mandatory for commerce apps)
- Native splash/loading, custom offline handling, no Safari-like browser chrome
Apple rejects apps "not sufficiently different from a mobile web browsing experience." (Guideline 4.2 confirmed actively enforced 2026: https://developer.apple.com/app-store/review/guidelines/, https://appfollow.io/blog/app-store-review-guidelines)

**Push notifications:** Works via `@capacitor/push-notifications`; 2026 recommended path is `@capacitor-firebase/messaging` for unified FCM tokens. Known gotcha: iOS returns a native APNs hex token but Firebase expects an FCM token — must convert. Background-killed-app code execution requires native extensions (iOS Notification Service Extension / silent push; Android FirebaseMessagingService). (https://dev.to/saltorgil/..., https://capawesome.io/blog/the-push-notifications-guide-for-capacitor/, https://lushbinary.com/blog/...2026)

**Camera/GPS/offline:** Standard Capacitor plugins cover camera and geolocation. Offline: web-layer caching works; true background sync is constrained (iOS suspends on backgrounding; Android battery optimization kills background processes). (https://capgo.app/blog/building-a-native-mobile-app-with-nextjs-and-capacitor/, https://nextnative.dev/blog/capacitor-mobile-app)

**OTA / Live Updates legality (important):** Shipping JS/HTML/CSS updates OTA is **explicitly compliant** — Apple permits interpreted-code downloads that don't change the app's primary purpose; Google exempts webview code from self-update restrictions. The real risk is Guideline **2.3.1** (hidden/dormant features), *not* 3.3.2 — i.e., using OTA to flip on features reviewers never saw. **Note: Ionic Appflow is shutting down in 2026**; Capgo is the actively-maintained OTA alternative. (https://capgo.app/blog/capacitor-ota-updates-app-store-approval-guide/, https://www.otakit.app/blog/ota-policies-for-app-store-and-google-play)

**Capacitor version:** Capacitor 8 current in 2026. **Caveat:** Next.js in Capacitor requires static export (`output: 'export'`) or a hosted-URL approach — Next 16 SSR/RSC server features don't run inside the native bundle without a remote server. (Flag: sources don't detail Next 16 App Router + Capacitor edge cases; needs validation.)

---

## 3. Monorepo code-sharing (Next.js web + Expo native)

**Ecosystem shift in 2026 — the headline:** **react-native-web has entered maintenance-only mode**; Meta/ecosystem direction is **React Strict DOM (RSD)**. (https://itnext.io/react-native-web-enters-maintenance-mode-...)

- **React Strict DOM (RSD):** Meta's standard for web+native styled components; web-side powered by **StyleX**. **Used in production at Meta** (Facebook/Instagram web + VR, hundreds of components). npm last updated **2026-01-09**, actively maintained. BUT Meta's own repo discussion (#270) counsels **adoption caution** — it's still pre-mainstream for outside teams. (https://github.com/facebook/react-strict-dom, https://github.com/facebook/react-strict-dom/discussions/270) **Flag: promising but not a safe default for a small team yet.**
- **Solito:** **Solito 5** removed react-native-web from the web rendering path — web now renders pure HTML + Next.js components, unlocking Tailwind/shadcn on web. This is a notable strategic pivot away from "RNW everywhere." (https://solito.dev/compatibility, https://www.callstack.com/events/exploring-solito-5-...)
- **Tamagui:** Still the most common glue in shared starter repos (`tamagui/starter-free`, huuquyet, amosbastian nx templates), typically Tamagui + Solito + Next + Expo. Actively maintained. (https://github.com/tamagui/starter-free)

**What the community actually uses in 2026:** The mainstream, low-risk pattern is **plain shared packages** — put business logic, Supabase client, types, and hooks in shared workspace packages; keep **navigation and UI native to each platform** (Next.js routing on web, Expo Router/React Navigation on native). Tamagui+Solito remains the popular opinionated stack; RSD is the forward-looking bet but early. Given an *existing, mature Next.js web app*, a full Tamagui/Solito rewrite is high-cost — sharing non-UI logic packages is the pragmatic route.

---

## 4. PWA on iOS in 2026

Sources here are partly vendor blogs (MagicBell, Mobiloud, OneSignal) — directionally consistent, but treat specifics as needing confirmation.

- **Push:** Works on **iOS 16.4+**, but **only for apps installed to the Home Screen** (Add to Home Screen) — Web Push does NOT work in the Safari tab. (https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide, https://documentation.onesignal.com/docs/en/web-push-for-ios)
- **EU restriction:** Home Screen web app push/PWA capabilities were curtailed in the EU around iOS 17.4 (DMA fallout). Flag: exact 2026 EU status is fluid — verify per-market.
- **Install UX (weak):** No `beforeinstallprompt`, no auto install prompt on iOS. User must manually Share → Add to Home Screen — major discoverability/conversion loss. **iOS 26 improvement:** sites added to Home Screen now default to opening as a web app.
- **Safari 18.4** added **Declarative Web Push** and **Screen Wake Lock**.
- **Persistent limits:** tighter caps on hardware access, offline storage, background processing, full-screen vs Android/desktop.

**Verdict:** iOS PWA push is real but gated behind manual install; not a substitute for a store-distributed app if push/reach matters.

---

## 5. 3D globe / map rendering on React Native

- **three.js on RN:** Works via **expo-gl** (`GLView`) + **expo-three**, optionally with **react-three-fiber**. Caveats: **requires a physical device** (simulators/emulators unreliable); documented concern that expo-gl's underlying **OpenGL-ES on iOS is deprecated** and a source of WebGL bugs. (https://docs.expo.dev/versions/latest/sdk/gl-view/, https://github.com/expo/expo-three, https://github.com/pmndrs/react-three-fiber/discussions/2219) **Flag: check whether current expo-gl has migrated to ANGLE/Metal — sources didn't confirm.**
- **globe.gl specifically:** globe.gl is a thin three.js wrapper that expects a DOM/canvas host — **not directly usable on RN**. You'd re-implement on raw three.js + expo-gl. There's a niche community package `@aeryflux/globe` (three.js-based, React + Expo) but it's not a mainstream/proven dependency. (https://github.com/aeryflux/globe)
- **Native maps (the pragmatic cross-platform choice):**
  - **MapLibre RN** — open-source, **genuinely free** with free tile providers (OpenFreeMap), 3D terrain; smallest community (~900 stars).
  - **Mapbox RN** — 3D terrain + 3D buildings, $0.50/1k loads after 50k free; best for custom styling/navigation.
  - **react-native-maps** — most popular (~15k stars) but **no 3D terrain**; Google Maps pricing $7/1k with $200/mo credit (~28.5k free loads).
  (https://www.pkgpulse.com/guides/react-native-maps-vs-mapbox-rn-vs-maplibre-rn-mobile-2026, https://js-maps.com/best-javascript-map-libraries/)

**Cost of WebGL globe cross-platform vs web-only:** A three.js/globe.gl globe is **cheap to keep web-only** (runs as-is in Next.js) but **expensive and fragile to port to native** (raw three.js + expo-gl, physical-device-only, deprecated-GL risk, no globe.gl reuse). Recommended pattern: **keep the WebGL globe web-only; on native use a maintained map SDK (MapLibre RN free, or Mapbox RN for 3D)** — accept a divergent map layer rather than force a shared WebGL globe.

---

## 6. Supabase Realtime — live location sharing + collaborative editing

Features (all three usable together): **Broadcast** (low-latency client messages: cursors, location pings, game/custom events), **Presence** (who's-online / shared state sync), **Postgres Changes** (DB row subscriptions). (https://supabase.com/docs/guides/realtime, /broadcast)

**Concrete limits (from official docs, https://supabase.com/docs/guides/realtime/limits):**

| Limit | Free | Pro | Pro (no cap)/Team | Enterprise |
|---|---|---|---|---|
| Concurrent connections | 200 | 500 | 10,000 | 10,000+ |
| Messages/sec | 100 | 500 | 2,500 | 2,500+ |
| Channel joins/sec | 100 | 500 | 2,500 | 2,500+ |
| Channels per connection | 100 | 100 | 100 | 100+ |
| Presence msgs/sec | 20 | 50 | 1,000 | 1,000+ |
| Presence keys/object | 10 | 10 | 10 | 10+ |
| Presence calls/client/30s | 5 | 5 | 5 | 5 |
| Broadcast payload | 256 KB | 3 MB | 3 MB | 3 MB+ |
| Broadcast replay retention | 72h | 72h | 72h | 72h |
| Postgres Changes payload | 1 MB | 1 MB | 1 MB | 1 MB |

**Free-tier monthly caps (billing, separate from rate limits):** ~**2 million Realtime messages/month** and **200 peak concurrent connections**. Pro is $25/mo. (https://supabase.com/docs/guides/realtime/pricing, https://aiagencyplus.com/supabase-free-tier-limits/)

**Practical notes for this use case:**
- **Live location sharing:** Use **Broadcast** (not Postgres Changes) for high-frequency position updates to avoid DB write amplification and stay under message caps.
- **Collaborative editing:** Broadcast for ephemeral cursor/selection state; persist authoritative doc state to Postgres. Presence for participant lists. Presence has a tight **20 msg/s (free)** and **5 calls/client/30s** ceiling — batch presence updates.
- **Free tier is fine for prototyping** (200 concurrent), but live-location apps burn messages fast — the 2M/month cap and 100 msg/s (free) rate limit are the first walls; budget for Pro. A production caution piece corroborates real-world connection/scaling surprises (https://www.agilesoftlabs.com/blog/2026/05/supabase-realtime-in-production-what).
- Works identically from Next.js web and React Native/Expo (same `@supabase/supabase-js` client) — **fully code-shareable**, a strong point for the shared-package strategy.

---

## Synthesis for the orchestrator (recommendation-shaping facts)

1. **Do not throw away the Next.js web app.** Expo web is second-class for SEO/content in 2026 (per its own advocates). Keep Next.js as the primary web surface.
2. **Two credible paths to native:**
   - **(A) Capacitor-wrap the Next.js app** — fastest reuse of existing web code; passes App Store *if* you add native nav + push + polish (Guideline 4.2). OTA updates are legal. Weak spot: background/offline, and heavy WebGL (globe) performance in a webview. Requires Next static-export or hosted model.
   - **(B) Monorepo: keep Next.js web + build Expo native, share logic packages** (Supabase client, types, hooks; UI stays platform-native, optionally Tamagui/Solito). More work, better native UX and native map/3D performance. RSD is the future but too early to bet on.
3. **The globe is the deciding technical constraint.** If the 3D WebGL globe is core to the mobile experience, Capacitor (WebGL in webview, perf risk) or a native three.js/expo-gl rebuild (fragile) both hurt — strongest option is **web-only WebGL globe + native map SDK (MapLibre/Mapbox) on mobile**, which pushes toward path (B) or a hybrid.
4. **Supabase Realtime is fully cross-platform and code-shareable** — a point in favor of any shared-logic architecture; plan for Pro tier once live location goes real.

### Uncertainties flagged
- Next.js 16 App Router + RSC behavior inside Capacitor 8 (static-export constraints) — not covered directly by sources; verify.
- expo-gl's current graphics backend on iOS (OpenGL-deprecation may already be resolved via ANGLE/Metal) — unconfirmed for 2026.
- EU-specific iOS PWA push status post-DMA in 2026 — fluid; verify per market.
- Vendor-authored sources (Capgo, NextNative, MagicBell, Mobiloud, OneSignal, aiagencyplus) used where independent sources were thin — treat their "it just works / no risk" framing skeptically; the Apple-guideline and Supabase-docs primary sources are more reliable.

### Key sources
- Expo SDK 56 changelog (2026-05-21): https://expo.dev/changelog/sdk-56 · RSC guide: https://docs.expo.dev/guides/server-components/ · DOM components: https://docs.expo.dev/guides/dom-components/
- RNW/Expo web maturity (2026-06-09): https://reactnativerelay.com/article/react-native-web-expo-cross-platform-2026
- Apple review guidelines: https://developer.apple.com/app-store/review/guidelines/ · Webview 4.2 reality: https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper
- Capacitor OTA legality / Appflow shutdown: https://capgo.app/blog/capacitor-ota-updates-app-store-approval-guide/ · https://www.otakit.app/blog/ota-policies-for-app-store-and-google-play
- Capacitor push (2026): https://capawesome.io/blog/the-push-notifications-guide-for-capacitor/
- react-strict-dom: https://github.com/facebook/react-strict-dom + discussion #270 · RNW maintenance mode: https://itnext.io/react-native-web-enters-maintenance-mode-... · Solito 5: https://solito.dev/compatibility
- PWA iOS 2026: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide · https://www.mobiloud.com/blog/progressive-web-apps-ios
- RN maps/globe: https://www.pkgpulse.com/guides/react-native-maps-vs-mapbox-rn-vs-maplibre-rn-mobile-2026 · expo-gl: https://docs.expo.dev/versions/latest/sdk/gl-view/ · expo-three: https://github.com/expo/expo-three
- Supabase Realtime limits: https://supabase.com/docs/guides/realtime/limits · pricing: https://supabase.com/docs/guides/realtime/pricing