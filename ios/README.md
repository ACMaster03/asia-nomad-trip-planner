# Livhold for iOS

Native SwiftUI client. Decision and reasoning: [`docs/PLATFORM-DECISION_2026-07-28.md`](../docs/PLATFORM-DECISION_2026-07-28.md).
It shares no UI code with `product/`; what it shares is the Supabase schema + RLS (the
contract) and the design tokens (the look).

## Open and run

```bash
open ios/Livhold.xcodeproj
```

Scheme `Livhold`, any iPhone simulator. iOS 17+, Swift 6, iPhone only for now.
The project uses Xcode's synchronized folders: a file added under `ios/Livhold/` is in
the target automatically, no project edit needed.

Today the app opens on the **component gallery** (`Gallery/GalleryView.swift`) — every
token and component in light and dark, the iOS twin of the web's `/dev` preview routes.
Hold it next to the web app to check they match.

## Design tokens — one source for both apps

`design/tokens.json` holds every colour (light + dark), the radii, the fonts and the
landscape washes. After editing it:

```bash
node tools/tokens.mjs
```

That rewrites the generated block in `product/src/app/globals.css`, `ios/Livhold/Theme/Tokens.swift`
and the wash image sets in `Assets.xcassets`. `node tools/tokens.mjs --check` fails if any
of them is stale. Token names are the CSS names: `--ac2Soft` is `Palette.ac2Soft`.

| Folder | What |
|---|---|
| `Theme/` | `Tokens.swift` (generated), colour helpers, washes, fonts |
| `Components/` | SwiftUI twins of the web components; each doc comment quotes the web classes it mirrors |
| `Gallery/` | the component gallery |

### Fonts

Lora (headings) and Work Sans (everything else), the variable `.ttf` files from
`google/fonts`, live in `ios/Livhold/Fonts/` with their OFL licences. Every font file in the
bundle is registered at launch — no Info.plist edit. If one is missing the app falls back to
New York / SF Pro and the gallery says so.

### App icon

Built from `product/public/brand/livhold-mark.png` by `tools/ios-app-icon.swift`: light (paper
background), dark (transparent — iOS draws the dark backdrop) and tinted (greyscale). Re-run it
if the mark changes.

## Signing and TestFlight

- Apple team: **Keep Your Habits** (`5325MP6M25`). Bundle id `com.livhold.app` — on livhold.com,
  not the team's domain, so it stays right if the app ever moves to another team.
- App ID registered with Sign in with Apple, Push Notifications and Associated Domains.
- Push: the team's APNs auth key `TGF3564T9M` (shared with the habit tracker; the `.p8` is kept
  outside the repo). Push is sent by a Supabase Edge Function, not Firebase/EAS. TestFlight and
  App Store builds must use the **production** APNs endpoint, Xcode debug builds the sandbox one.
- Certificates: the team's fastlane match repo `KeepYourHabits/apple-certificates`, shared
  with the habit tracker. The distribution certificate is reused; match adds Livhold's
  profiles next to the habit app's.
- `bundle exec fastlane beta` (from `ios/`) builds and uploads to TestFlight. It expects the
  same env as the habit tracker's deploy job: `APP_STORE_CONNECT_API_KEY_{KEY_ID,ISSUER_ID,KEY}`,
  `MATCH_PASSWORD`, and git access to the match repo.

Not done yet (one-time, by hand):
1. The app record in App Store Connect (privacy policy URL: https://www.livhold.com/privacy).
2. `bundle exec fastlane match appstore` once, non-readonly, to create the profiles.
