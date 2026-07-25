# Screen × State Coverage Matrix (M0 design gate)

Every cell must exist as a state in the corresponding mock before implementation of that
screen begins. Mocks live in `design/mocks/` — self-contained HTML, one file per screen,
state switcher + phone/desktop + dark/light + annotation toggles in the mock bar.

Legend: ☐ mock pending · ☑ mock done · ✅ approved by owner

| # | File | Screen | States (switcher) |
|---|------|--------|-------------------|
| 1 | `01-signin-onboarding.html` | Sign-in & onboarding | ☐ new user sign-in · ☐ returning user · ☐ OTP/magic sent · ☐ onboarding wizard (trip basics) · ☐ co-editor invite accept · ☐ auth error |
| 2 | `02-dashboard.html` | Dashboard | ☐ planning phase (owner) · ☐ live phase (traveller, plan-vs-actual) · ☐ empty (no trip) · ☐ viewer (read-only) |
| 3 | `03-itinerary.html` | Itinerary: Stops/Stays/Transport/Extras | ☐ stops+timeline table+filters (editor) · ☐ stays chrono/decluttered · ☐ stay edit modal (cancel-until, charge date) · ☐ transport collapsed+type filter · ☐ transport expanded row · ☐ extras · ☐ viewer read-only |
| 4 | `04-money.html` | Money: Budget/Monthly/Ledger | ☐ budget view 1 (bars+strip) · ☐ budget view 2 (by stop) · ☐ monthly (optional, simplified) · ☐ ledger + auto-imported plan costs · ☐ ledger add entry · ☐ empty ledger · ☑ budget-cap warning (amber ≥90% — shown in the budget views; red over-cap variant described in a ✎ note) |
| 5 | `05-map.html` | Map | ☐ planning view (globe, arcs, hazards) · ☐ live view (position ring, last-seen) · ☐ country panel · ☐ settings overlay (timezone, layers) · ☐ lite/2D fallback |
| 6 | `06-live.html` | /live today screen (phone-first) | ☐ today overview · ☐ check-in flow (place pick→rate→comment→photo) · ☐ custom place add (GPS) · ☐ offline (queued badge) · ☐ sync error/retry · ☐ plan-vs-actual timeline · ☐ pre-trip state (not started) |
| 7 | `07-follow.html` | /follow/[token] (no account) | ☐ follower view (globe last-seen + feed + photos) · ☑ pre-trip (countdown + coarse route, before Aug 31) · ☐ notify-me opt-in · ☐ quiet period (no events days) · ☐ revoked/expired link · ☐ sharing paused |
| 8 | `08-explore.html` | Explore / knowledge base | ☐ start-empty + country filter · ☐ country selected (cards, own-notes badges) · ☐ city detail · ☐ admin state (add city/field, edit values) |
| 9 | `09-settings.html` | Settings | ☐ trip meta + FX · ☐ sharing panel (links create/revoke, follower count, co-editors) · ☐ theme & accent/destination palettes · ☐ danger zone (delete/leave trip) |
| 10 | `10-later-phases.html` | Later-phase endframes | ☐ public place page /p/[country]/[place] · ☐ public trip journal · ☐ Expo app 4 tabs (Today/Map/Feed/Money) · ☐ moderation queue (admin) |
| 11 | `11-digest-links.html` | Digest links: /digest/confirm, /digest/unsubscribe, the emails | ✅ confirmed · ✅ already confirmed · ✅ expired/invalid link · ✅ unsubscribed · ✅ undo taken · ✅ one-click (RFC 8058) · ✅ server error · ✅ the two plain-text emails |

Global requirements for every mock:
- Desktop AND phone viewport must both look intentional (container queries; check both).
- Dark AND light theme must both work (design tokens only, no hardcoded colors).
- Annotation notes (✎) explain non-obvious behavior, data sources, and open questions.
- Sample data: realistic Asia trip (Budapest → Bangkok Aug 31, Bangkok apartment for
  September, onward route TBD) — never real confirmation numbers or personal data.
- Roles shown where relevant: owner/editor · co-editor · viewer · follower (no account) · admin.

Review flow: owner walks each file's states in the browser → amendments noted as ✎ notes →
re-approved → matrix cell flips to ✅. Approved endframes are the acceptance criteria for
milestones M1–M4 (see docs/ARCHITECTURE.md roadmap update).

Sample data is canonical: every number/date/name in the mocks comes from `design/mocks/FIXTURES.md`.

## Known gaps (decide at walkthrough)

- plan-vs-actual DRIFT endframe
- post-trip "Done" phase (dashboard recap / live after end / follow after end)
- create-follow-link modal (label, expiry, QR)
- traveller notification settings section (deadline push T-7/T-1, follower-checkin push)
- account-level settings + GDPR account deletion
- 03 overlapping-stops conflict state
- permission-denied states (viewer on owner URL, revoked co-editor mid-session)
- 04 viewer read-only state
- loading/skeleton states (explicit decision to skip endframes or not)
