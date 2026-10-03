# App Store privacy labels — the answers

Apple's App Privacy questionnaire is a third declaration of the same facts as `/privacy`
and [`PLAY-DATA-SAFETY.md`](PLAY-DATA-SAFETY.md), which carries the evidence for each row.
**If either of those changes, this file changes in the same commit.**

Filled for the iOS app (`com.livhold.app`), 2026-09-26. Rewritten on 2026-10-03 with `/privacy`:
Coarse Location and Product Interaction are now collected (see the two rows marked new).
**Update the questionnaire in App Store Connect to match.**

`/privacy` gained "If you join the list on journey.livhold.com" on 2026-10-01: a form on the
landing page (migration 44, `docs/landing-form/`), not in the app. Nothing in the app collects
it, so no label here changes.

## Tracking

**No.** Nothing is used to track across other companies' apps or websites, no data broker,
no advertising SDK. So no App Tracking Transparency prompt, and every "Used to track you?"
below is No.

## Data collected — all "Linked to you", none used for tracking

| Apple category → type | Purpose | What it is |
|---|---|---|
| Contact Info → **Email Address** | App Functionality | sign-in identifier; follower digest address |
| Contact Info → **Name** | App Functionality | optional first name shown to people you plan with / followers |
| Identifiers → **User ID** | App Functionality | account id |
| Identifiers → **Device ID** | App Functionality | APNs push token, only after opt-in (same over-declare call as Play) |
| Financial Info → **Other Financial Info** | App Functionality | the money ledger: amounts, categories, notes |
| User Content → **Photos or Videos** | App Functionality | photos attached to check-ins |
| User Content → **Other User Content** | App Functionality | itinerary, stays/transport (incl. booking links, notes), check-in comments, post comments, reactions |
| Location → **Coarse Location** (new) | App Functionality | itinerary cities and check-in places the traveller types, and the session IP (see Logs); never from the device |
| Usage Data → **Product Interaction** (new) | Analytics | #120: the days a follower opened the feed (one mark a day, kept 12 months), sign-up source, setup steps completed; own database, no SDK |

## Data NOT collected

Precise Location · Health & Fitness · Payment Info · Credit Info · Contacts ·
Emails or Text Messages · Audio · Gameplay · Customer Support · Browsing History ·
Search History · Purchases · Usage Data (advertising, other) ·
Diagnostics (crash, performance, other) · Sensitive Info · Surroundings · Body · Other Data.

## Logs (checked on staging, 2026-09-26)

| Where | What it holds | Label impact |
|---|---|---|
| `auth.sessions` (Supabase Auth, built in) | **IP address and user-agent** of every signed-in session. No `timebox`/`inactivity_timeout` in `config.toml`, so a row lives until sign-out or account deletion (staging's oldest: 2026-07-22). | IP is location at city level at best → covered by **Coarse Location**; purpose App Functionality (Apple counts security and fraud prevention there). |
| `auth.audit_log_entries` | empty — audit events are not written to the database | none |
| `alert_log`, digest `confirm_sent_at` / `last_sent_at` | what the service sent, to which address, when (dedupe) | none beyond Email Address |
| Supabase / Vercel platform logs | request logs with IP, short retention, operations only | none (not analysed per user) |

Since 2 Oct 2026 `/privacy` names them, under "Your account": the connection address and the
kind of browser or app, kept while signed in, plus the providers' short-lived request logs. Under
GDPR an IP address is personal data, so the line is needed regardless of the store labels.

## What would make these answers false on iOS

- **Location.** The iOS app must not use CoreLocation, and **photo upload must re-encode the
  image** (drop EXIF/GPS) exactly like `compressImage()` on the web. A `PhotosPicker` item
  uploaded as-is carries GPS coordinates → Location becomes collected.
- **Diagnostics / Usage Data.** Adding Sentry, Crashlytics, TelemetryDeck or any analytics.
  Product Interaction is declared for #120's counts in our own database; a third-party SDK
  would also change "Used to track you?" and the policy's "no analytics company".
- **Purchases.** Adding in-app purchase for premium (#64).
- **Precise Location via live position**, if check-ins ever start reading GPS.

## Age rating (for reference)

Questionnaire answers: User-Generated Content Yes, Social Media Yes, Messaging and Chat Yes,
everything else No/None → calculated 13+. The Terms require **16+**; use the questionnaire's
"Override to Higher Age Rating" → 16+ so the store and the Terms agree.
