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

### WORTH DOING — Play still needs a privacy policy and terms page

`app/login/page.tsx` renders "Terms" and "Privacy Policy" as `<span>` elements
with no `href`, and there is no `/terms` or `/privacy` route. Play Console will
not accept a submission without a privacy policy URL. Not auth work, so it was
deliberately left out of the password change; recorded here so it is not
discovered at submission time.

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
