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

### OPEN — establish whether Article 27 applies at all (Patrik) — the premise below was wrong

**The earlier version of this entry said "KeepYourHabits Ltd is London-based
with no EEA establishment". Company records contradict both halves**, so the
conclusion that followed from it — that a representative must be engaged — is
not safe to act on until someone qualified confirms it. The field stays unset
meanwhile, because "unresolved" is the honest state just as "unmet" was.

Three independent documents, all in Drive under `MSI PC leftover`:

| Source | What it says |
|---|---|
| Certificate of Incorporation, company 17055436 (25 Feb 2026) | Sole director and PSC Patrik Tamás Grohmann — **"Country/State Usually Resident: HUNGARY"**, Hungarian nationality |
| `Clarification_ Relationship with UK.pdf`, signed as sole director, 28 Feb 2026 | "all management and operational activities are carried out remotely from **Hungary, where I reside**… no employees, physical premises, or customers located in the UK… managed from Hungary" |
| `Hoxton Mix Certification.pdf` | 66 Paul Street is a **virtual office** subscription — "This does not imply physical occupation of the premises." |

So the UK presence is a mailbox, and the company is run from Budapest.

**Why that may remove the obligation rather than shrink it.** Article 27 binds
controllers caught by Article 3(2) — those with *no* establishment in the Union.
Establishment under the GDPR turns on the effective and real exercise of
activity through stable arrangements, not on where a company is incorporated.
A company whose only director manages it from Budapest has a serious argument
that it *is* established in the Union, in which case Article 3(1) applies and
Article 27 never engages.

**"The representative is me" is the one answer that does not work.** The role
exists to give EEA data subjects and supervisory authorities a contact separate
from the controller; a controller does not represent itself. The live question
is not who to appoint — it is whether anything needs appointing.

**Two consequences if the Hungary reading is right**, and both reach further
than one field:

- The policy currently reasons throughout from "UK controller → UK GDPR → ICO".
  An establishment in Hungary would put the Hungarian NAIH in the picture, quite
  possibly alongside the ICO rather than instead of it, since the company is also
  UK-incorporated.
- It is *cheaper* than the alternative — no £300–800/year representative — which
  is exactly why it deserves a qualified opinion rather than a hopeful reading by
  the people who benefit from it.

Worth an hour of somebody qualified, with those three documents in front of them.
Still not urgent enough to block the Play submission.

If it turns out a representative *is* needed, commercial providers do this for
roughly £300–800/year.

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

### MOSTLY DONE — the company facts on the legal pages (one left)

`/privacy`, `/terms` and `/delete-account` are built and linked from the sign-in
screen. Five of the six facts are now set; an unfilled value still renders as an
orange `[… — not set yet]` marker rather than printing the token, so an
unfinished page cannot be mistaken for a finished one.

All of them live in **`product/src/lib/legal/entity.ts`** — one file, one edit:

| Field | State |
|---|---|
| `entity` | ✅ `KeepYourHabits Ltd` |
| `jurisdiction` | ✅ `England & Wales` — London-based, confirmed with the owner |
| `address` | ✅ `66 Paul Street, London, England, EC2A 4NA` — read off the Companies House register for company **17055436**, not recalled |
| `contactEmail` | ✅ `privacy@keepyourhabits.com` — **see the caveat below** |
| `dataRegion` | ✅ `Ireland` — prod `Nomad_Trip_Planner` runs in `eu-west-1` |
| `euRepresentative` | ❌ still unset — see the Article 27 entry above |

`/terms` and `/delete-account` now carry **no** markers at all. `/privacy` has
exactly one left, at the Article 27 line.

**`privacy@keepyourhabits.com` has to actually exist and be read.** Nothing in
the code can check that, and this is the one of the five that fails silently: a
policy naming a dead address is worse than one naming none, because Play treats
it as a working contact route and a GDPR request landing there starts a
one-month clock whether or not anyone is looking. Confirm the mailbox or the
forwarding rule before submission.

**`dataRegion` was checked, not recalled** — `supabase projects list` reports
`eu-west-1` for the prod project, which is AWS Ireland. This had a knock-on
effect worth knowing about: Vercel already serves from Dublin, so the transfers
section's "providers in Ireland and *X*" would have rendered as "Ireland and
Ireland". It now names one country. If the Supabase project is ever moved to
another region, that sentence has to go back to naming two.

**The UK Ltd changed the policy, not just a field.** The rights section named
"the GDPR" generically, which is wrong for a UK controller: it now names the UK
GDPR and the Data Protection Act 2018, points UK complaints at the ICO and EEA
complaints at the reader's own authority, and adds a data-transfer section
resting on the UK↔EEA adequacy decisions in both directions.

**Where these came from.** An earlier session could not reach
keepyourhabits.com (egress proxy) and left the values unset rather than guess
them. They were filled in on 2026-09-16 from the Companies House public register
and from the Supabase project itself — both authoritative sources rather than
the landing page, which is why they are safe to disagree with if that page says
something else. If the landing page's policy names a *different* entity, that is
a discrepancy to resolve, not a value to copy.

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

### DONE — deploy the digest Edge Functions (2026-09-16)

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

**Deployed 2026-09-16.** `digest` v6 → v7, `digest-send` v7 → v8, both ACTIVE
on `wvmnudcwcqktcugouqoe`. Two corrections to the recipe above, for next time:

- `supabase login` and `supabase link` were both unnecessary. The CLI was
  already authenticated, and `--project-ref <ref>` targets the project
  directly — which also skips the link step's database-password prompt:

      supabase functions deploy digest      --project-ref wvmnudcwcqktcugouqoe
      supabase functions deploy digest-send --project-ref wvmnudcwcqktcugouqoe

- **Docker must be running.** The CLI bundles in
  `public.ecr.aws/supabase/edge-runtime`, pulling it on first use (~700 MB,
  a few minutes). The second deploy reused the cached image and took seconds.

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
