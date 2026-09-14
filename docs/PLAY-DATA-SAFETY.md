# Play Data Safety — the answers, and where each one comes from

The Data safety form in Play Console is a **second declaration of the same facts**
as `/privacy`. Google compares them, and a mismatch is a rejection. So this file
is the single worked answer both are filled from: each row names the evidence in
the repo, so a future change can be re-checked instead of re-guessed.

**Rule: if this file changes, `src/app/privacy/page.tsx` changes in the same
commit.** Nothing here is collected for advertising, sold, or shared with a third
party for its own purposes — every "shared" answer below is No.

Last checked against the code: **2026-09-14**.

## Required URLs

| Field | Value | Status |
|---|---|---|
| Privacy policy | `https://www.livhold.com/privacy` | live once merged |
| Account deletion | `https://www.livhold.com/delete-account` | live once merged |

Both must answer over HTTPS **with no sign-in**. They are outside the `(app)`
group and excluded from the proxy matcher in `src/proxy.ts`, so they do.

## Data types — collected

| Category → type | Purpose | Optional? | Evidence |
|---|---|---|---|
| Personal info → **Email address** | App functionality, Account management | Required | `auth.users`; the only sign-in identifier |
| Personal info → **Name** | App functionality | Optional | `user_metadata.first_name`, `profiles.display_name` |
| Personal info → **User IDs** | App functionality, Account management | Required | `auth.users.id`, referenced by every table |
| Financial info → **Other financial info** | App functionality | Optional | `public.ledger` — date, type, category, amount, currency, note |
| Photos and videos → **Photos** | App functionality | Optional | `trip-media` bucket, migration 12 |
| Messages → **Other in-app messages** | App functionality | Optional | `check_ins.comment`, `notes.body`, the `notes` columns on stays/transport/segments |
| App info and performance → *(nothing)* | — | — | no crash SDK, no performance SDK |
| Device or other IDs → **Device or other IDs** | App functionality | Optional | `user_push_subscriptions.endpoint` — see the judgment call below |

### The one judgment call: push endpoints

A Web Push endpoint is a URL minted by the browser's push service. It is not an
advertising ID and not a hardware identifier, but it *is* a persistent handle for
one browser on one device. **Declare it** under Device or other IDs rather than
argue the point — over-declaring costs nothing, and an omission Google spots is a
policy strike. It is collected only after an explicit opt-in and is deleted when
push is turned off or the account is deleted.

## Data types — NOT collected

Each of these is a deliberate, verifiable No. They are the reason this app's form
is unusually short for a travel product.

| Category | Why it is No | Evidence |
|---|---|---|
| **Location** (precise or approximate) | The app never asks the device where it is. A check-in is placed by the city the traveller picked from a list. | no `navigator.geolocation` anywhere in `product/src` |
| **Location, via photo metadata** | Photos are re-encoded through a canvas before upload, which drops all EXIF — GPS, camera, timestamp. What leaves the phone is pixels. | `lib/trips/media.ts` → `compressImage()`: `drawImage` then `canvas.toBlob('image/jpeg')` |
| **App activity / analytics** | There is no analytics, attribution, or advertising SDK in the bundle. | no `@vercel/analytics`, Sentry, gtag, PostHog, Plausible in `package.json` or `src` |
| **Financial → payment info** | The app takes no money. | no payment provider anywhere |
| **Contacts, calendar, SMS, call logs, health, audio, files** | Never requested. | — |

⚠ **The EXIF answer is load-bearing and incidental.** Nothing enforces it but the
shape of `compressImage()`. If anyone ever adds an "upload original quality"
path, or uploads a `File` straight to storage without going through that
function, **this form becomes a false declaration** and Location starts being
collected. Treat that function as a compliance boundary, not just a resizer.

## Security and handling

| Question | Answer | Evidence |
|---|---|---|
| Encrypted in transit? | **Yes** | HTTPS throughout; Supabase and Vercel both TLS-only |
| Can users request deletion? | **Yes** | in-app `delete_my_account` (migration 26) + `/delete-account` |
| Committed to Play Families policy? | N/A | not a children's app; 16+ in the Terms |
| Independent security review? | **No** | answer honestly — the repo has `/security-review`, which is not the same thing |

### The photo caveat worth knowing before you answer

`trip-media` is a **public** bucket (migration 12). Paths are unguessable
(`<tripId>/<eventId>/<n>.jpg`, both UUIDs), but there is no authorization check
on a fetch — anyone holding the exact URL can open the photo. That does not
change any Data safety answer, and `/privacy` discloses it plainly rather than
implying photos are access-controlled. Migration 12's own comment names the fix
(`public→false` plus a signing route) if it ever matters more than it does now.

## App access — for the review team

The app is entirely behind sign-in, so Play needs working credentials. Password
sign-in exists for exactly this reason: Play requires credentials that are
"reusable, valid regardless of user location", and says an app gated behind
*one-time passwords* must supply something that bypasses them — a magic link is
a one-time password.

- Create the reviewer account by hand in Supabase (see `NOTES.md`, 2026-09-14).
- Give Play that address and password under **App access → All functionality is restricted**.
- **Seed it with a real trip.** A reviewer signing in to an empty create-your-first-trip
  screen has seen nothing of the app, and that is the impression the review is formed on.

## Sources

- [Play: Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Play: app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Play: providing sign-in details for review](https://support.google.com/googleplay/android-developer/answer/15748846)
