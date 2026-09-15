# Project notes — open items

Running log. Newest first. Add an entry when something is left half-done, or
when a decision needs to survive the conversation it was made in.

---

## 2026-09-14

### OPEN — turn password sign-in on in the Supabase dashboard (Patrik)

**The code is merged and does nothing until this is done.** Password sign-in is
on the login screen and in Account → Password, but the Supabase project still
has the password grant disabled, so every attempt answers
`Invalid login credentials` no matter what anyone types.

1. **Authentication → Providers → Email → enable password.**
2. **Leave "Allow new users to sign up" OFF.** This app has no sign-up anywhere
   and the Play submission is simpler without one. A password here is a second
   key to a door you already have.
3. **Create the review account by hand** (Authentication → Users → Add user,
   with a password), then give Play Console that address and password under
   **App access**.

**Why it exists at all.** Google Play requires sign-in details that are
"reusable, valid regardless of user location", and says explicitly that an app
gated behind *one-time passwords* must provide credentials that bypass them — a
magic link is a one-time password, so the old configuration could not be
reviewed. The second reason is ours rather than Google's: a password has no
email round trip, so it cannot be lost to a slow mail server or handed to the
wrong browser, which is the failure `lib/supabase/otp.ts` exists to document.

**No email-template change is needed.** The reset link points at
`/auth/callback?next=/account`, which reads `?next=` and handles both shapes —
the default `/auth/v1/verify?…&redirect_to=` template *and* a repointed
`/auth/confirm` one. `recovery` was already in `OTP_TYPES` in
`app/auth/confirm/route.ts`. This deliberately avoids the
`{{ .Type }}` trap in `docs/AUTH-EMAIL-TEMPLATE.md` that cost two test rounds.

**What is NOT verified.** This session's container has no egress to
`*.supabase.co` (403 from the egress proxy), so a real sign-in was never
exercised — only the UI, and the no-connection error branch. **The first
password set and the first password sign-in are their own test**, along with
one reset link opened from a phone's mail app, which is the journey that broke
before.

### OPEN — appoint an EU/EEA representative (Article 27), Patrik

**A legal obligation, currently unmet, and the privacy policy says so on its
face** — the EU-representative line renders as an unset marker until it is
appointed.

KeepYourHabits Ltd is London-based with no EEA establishment, and it offers this
service to people in the EEA — the travellers and the family following the trip
are in Hungary. That combination is exactly what Article 27 of the EU GDPR is
about: appoint a representative established in an EEA member state, and **name
them in the privacy notice**, which is why `entity.ts` has a field for it rather
than leaving it implicit.

Being in London is what *creates* this, not what excuses it: before Brexit a UK
company was EU-established and needed no representative. An office in the EEA —
Dublin, Budapest — would remove the requirement again. Without one, it applies.

Commercial providers do this for roughly £300–800/year. Alternatively an EEA
establishment of your own removes the requirement altogether. Not urgent enough
to block the Play submission, urgent enough not to forget — and cheap to fix.

**ICO: settled, and separate from this.** The data protection fee is paid for
this year (owner, 2026-09-15), so the company is on the ICO register. Two things
follow, neither of which the payment itself covers:

- It **renews annually**, and lapsing is an enforcement matter in its own right.
  It is also exactly the sort of thing that lapses while somebody is on the road
  and not reading post. Put the renewal in a calendar rather than trusting the
  reminder email to reach you.
- The register entry is public and carries the **registered address** — one of
  the fields still unset in `entity.ts`. Take it from there rather than from
  memory: it is the address the regulator already holds, and the privacy policy
  should not disagree with the regulator.

Paying the ICO fee is *not* the Article 27 item above. One is a UK registration;
the other is an EEA representative. Neither substitutes for the other.

### OPEN — fill in the five company facts on the legal pages (Patrik)

`/privacy`, `/terms` and `/delete-account` are built and linked from the sign-in
screen, but five facts are **not set**, and the pages say so loudly: an unfilled
value renders as an orange `[… — not set yet]` marker rather than printing the
token, so an unfinished page cannot be mistaken for a finished one.

All five live in **`product/src/lib/legal/entity.ts`** — one file, one edit:

| Field | What it needs |
|---|---|
| `entity` | ✅ `KeepYourHabits Ltd` |
| `jurisdiction` | ✅ `England & Wales` — London-based, confirmed with the owner |
| `address` | registered address **as filed at Companies House** — "London" is not an address; the page prints it verbatim |
| `contactEmail` | a **monitored** address — Play requires a working contact route |
| `dataRegion` | where the Supabase project actually runs |
| `euRepresentative` | see the Article 27 entry above |

`dataRegion` is the one to *check* rather than recall — Supabase → Project
Settings → General. A wrong region claim in a privacy policy is a bad one to get
wrong, and the policy's data-transfer section reasons from it.

**The UK Ltd changed the policy, not just a field.** The rights section named
"the GDPR" generically, which is wrong for a UK controller: it now names the UK
GDPR and the Data Protection Act 2018, points UK complaints at the ICO and EEA
complaints at the reader's own authority, and adds a data-transfer section
resting on the UK↔EEA adequacy decisions in both directions.

**Taking these from keepyourhabits.com was the intent and did not happen**:
this session's egress proxy blocks that domain, and `add_repo` refused the
`KeepYourHabits/WebLandingPage` source as a cross-owner add. So the values above
were left unset rather than guessed. Copy them from the existing policy if the
two are the same entity.

**Not reviewed by a lawyer.** The liability and governing-law clauses in
`/terms` are the ordinary shape of such a clause, written to be read rather than
litigated. Worth an hour of somebody qualified before this is a paid product; it
is defensible as-is for a free one.

### DONE — /delete-account, which Play requires and nobody had noticed

Play's User Data policy wants account deletion available **two** ways: in the app
*and* at a public web URL that works with no sign-in and no install. The in-app
half has existed since migration 26; the URL half did not exist at all, and it is
a required field on the Data safety form.

`/delete-account` is deliberately **not a button**. An unauthenticated endpoint
that erases an account on request is an account takeover with extra steps —
`delete_my_account` keeps no tombstone and has no undo. Play asks that a *request*
be possible without signing in, not that the deletion itself be unauthenticated.
So the page routes: the real button stays behind the session, and an
identity-checked email route covers anyone locked out.

### REFERENCE — docs/PLAY-DATA-SAFETY.md

The Data safety form is a second declaration of the same facts as `/privacy`, and
Google compares them. Every answer is worked out there with its evidence in the
code, so the two cannot drift. **Read the EXIF warning in it before anyone
touches `lib/trips/media.ts`** — the "we do not collect location" answer rests
entirely on that function's canvas re-encode, and an "upload original" feature
would silently turn the form into a false declaration.

---

## 2026-08-28

### OPEN — deploy the digest Edge Functions (Patrik, from his Mac)

**Do this before followers start subscribing.** Departure is 31 Aug, and the
digests begin going out for real once family follow the trip.

The code is merged and on `main`; the copies running on Supabase are still the
old ones. Edge Functions do not deploy with Vercel — they ship separately, and
nothing sends them up automatically.

```
supabase login
supabase link --project-ref wvmnudcwcqktcugouqoe
supabase functions deploy digest
supabase functions deploy digest-send
```

Run from the repo root. The CLI picks up `_shared/resend.ts` and
`_shared/cronAuth.ts` on its own — both functions import them, which is also
why this is not a paste-into-the-dashboard job.

**What it changes:** the two functions stop discarding Postgres errors.

Today, if the database fails while `digest-send` is gathering a trip's events,
the query returns nothing, the trip reads as a quiet day, every subscriber is
skipped, `last_sent_at` is left untouched — and the run still reports success.
A total digest outage is indistinguishable from "nothing happened". After this
the reason is logged, and the run reports `fetchFailures` in its response.

`digest` (the subscribe/confirm/unsubscribe endpoint) had the same problem: a
failed upsert answered the follower "try again" and wrote nothing anywhere, and
a database error during the share lookup was reported as "invalid link" — the
most misleading answer it could give.

**No user-facing bug is fixed by this**, which is why it was left. It only
matters the first time something goes wrong, and then it matters a lot.

### DONE — sign-in works from any browser

Both Supabase email templates now point at `/auth/confirm`. Full account in
`docs/AUTH-EMAIL-TEMPLATE.md`, including the `{{ .Type }}` trap that cost two
test rounds. Magic Link is verified end to end; Confirm signup is correct but
unexercised until someone new is invited — treat the first invite as its test.

### CLOSED — Vercel project pause

While chasing the outage, `unpause_project` was called on the Vercel project
after misreading a `live: false` field. Petra confirmed 2026-08-28 that no
pause was deliberate, so the project is correctly left running. No action.

### WORTH DOING — put the email templates under version control

The sign-in outage happened because the Supabase email template is the only
part of the auth path with no version control. It lives in the dashboard, it
drifted from what `auth/confirm/route.ts` was written to receive, and no diff
anywhere could catch it — which is why it took a day and two wrong theories to
find.

Supabase supports managing templates in `supabase/config.toml` and deploying
them with the CLI, alongside the migrations already tracked here. Roughly half
an hour, needs no dashboard access, and turns that whole class of failure into
an ordinary code review.
