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

Lora (headings) and Work Sans (everything else) are open-licence (OFL). Drop the variable
`.ttf` files into `ios/Livhold/Fonts/` and they are registered at launch — no Info.plist edit.
Until then the app falls back to New York / SF Pro and the gallery shows a notice.

## Signing and TestFlight

- Apple team: **Keep Your Habits** (`5325MP6M25`). Bundle id `com.keepyourhabits.livhold`.
- Certificates: the team's fastlane match repo `KeepYourHabits/apple-certificates`, shared
  with the habit tracker. The distribution certificate is reused; match adds Livhold's
  profiles next to the habit app's.
- `bundle exec fastlane beta` (from `ios/`) builds and uploads to TestFlight. It expects the
  same env as the habit tracker's deploy job: `APP_STORE_CONNECT_API_KEY_{KEY_ID,ISSUER_ID,KEY}`,
  `MATCH_PASSWORD`, and git access to the match repo.

Not done yet (one-time, by hand):
1. Register the App ID `com.keepyourhabits.livhold` (with Sign in with Apple + Push) and create
   the app record in App Store Connect.
2. `bundle exec fastlane match appstore` once, non-readonly, to create the profiles.
3. An APNs auth key (`.p8`) for push, if the team has none yet — it is team-wide.
