# Sign-in emails: the template Supabase must send

Handover note. **One person with Supabase dashboard access has to do step 2** —
it cannot be done from the repo, and it is the reason this file exists.

## The bug this fixes

Reported 2026-08-27: a co-editor requested a sign-in link, received it, tapped
it in the Gmail app, and got **"Sign-in link invalid or expired"** on a link
under a minute old. Requesting fresh links never helped.

The link Supabase had sent looked like this:

```
https://<project>.supabase.co/auth/v1/verify
  ?token=pkce_ae2133…            <-- the tell
  &type=magiclink
  &redirect_to=https://www.livhold.com/auth/callback
```

`pkce_` means the link was bound to one browser. Under PKCE, `signInWithOtp`
mints a secret **code verifier** and leaves it in the storage of the browser
that asked; the email carries only the matching code, and
`exchangeCodeForSession` needs both halves. Gmail (and Mail, and Slack) open
links in their **own in-app browser**, which has its own storage and no
verifier — so the exchange fails, and the app reported the only thing it could:
"invalid or expired". The link was neither.

The repo had predicted this twice and never wired up the cure:

- `docs/PHONE-TESTPLAN.md` — "known iOS trap (magic links can't always cross app contexts)"
- `docs/archive/strategy-research_2026-07-10/06-critique-A.md` — "the exchange *fails*, not just annoys"

Nobody noticed for weeks because **existing sessions kept working**. Only a
genuinely new sign-in hits it: a new device, a cleared browser, an invited
person.

Note this template is the one part of the sign-in path with **no version
control** — it lives only in the dashboard. That is how it drifted away from
what `auth/confirm/route.ts` was written to receive, with no diff to catch it.

## Step 1 — the code (DONE, merged, VERIFIED IN PRODUCTION 2026-08-28)

Confirmed by the person who reported it, on the exact journey that failed:
signed out completely, requested a link in Safari, opened it from the **Gmail
app** — which handed it to Chrome, a browser holding no session — and landed
signed in. The emailed token now reads `token=89e1e13d…` where it previously
read `token=pkce_ae2133…`; that missing prefix is the fix.


- `product/src/lib/supabase/otp.ts` — new send-only, **non-PKCE** client used
  for the sign-in email only. No verifier is minted, so the link is redeemable
  in any browser. It holds no session and touches no storage.
- `product/src/app/login/page.tsx` — sends through that client.
- `product/src/app/auth/confirm/route.ts` — verifies `token_hash` server-side.
  Hardened so the session cookies are written onto the redirect response
  itself; the previous version could have verified a link and still landed the
  reader on `/dashboard` with no session.
- `product/src/app/auth/callback/CallbackClient.tsx` — accepts all three link
  shapes: implicit tokens in the URL fragment, an implicit error, and legacy
  `?code=` PKCE links still sitting in inboxes.
- `product/src/app/auth/auth-code-error/page.tsx` — shows the real reason
  instead of one catch-all sentence.

**Deploy order does not matter.** With the code alone, Supabase puts the
verified tokens in the callback's URL fragment and `/auth/callback` completes
the sign-in — already cross-browser, already fixed. Step 2 is the upgrade: it
moves verification server-side so no token ever appears in the address bar or
browser history.

## Step 2 — the template (NEEDS THE DASHBOARD)

**Authentication → Email Templates → Magic Link.** Replace the link's `href`
(currently `{{ .ConfirmationURL }}`) with:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard
```

> **`{{ .Type }}` DOES NOT WORK — write the type literally.** This cost two
> test rounds on 2026-08-28. `{{ .SiteURL }}` and `{{ .TokenHash }}` are
> substituted; `{{ .Type }}` is not, and renders as nothing — producing
> `…&type=&next=/dashboard`, which `/auth/confirm` rejects because an empty
> string matches none of its allowed OTP types. Each template must state its
> own type: **`type=magiclink`** here, **`type=signup`** on Confirm signup.
> The route says so explicitly now if it ever sees an empty one again.

Keep all the Livhold styling. Only the `href` changes — in **both** the green
"Open Livhold" button and the "Button not working? Copy this link" fallback
underneath it.

Then do the same on **Confirm signup**, which is the template a brand-new
address gets — with **`type=signup`**, not `magiclink`. Missing it means
existing users are fixed and first-time users are not: the worst possible
split, and invisible to anyone who already has an account.

**Status 2026-08-28:** Magic Link is done and verified in production — link
requested in Safari, opened from the Gmail app, completed in Chrome, signed in.
Three separate browser contexts, which is the case that used to fail. Site URL
was also corrected from `https://livhold.com` to `https://www.livhold.com`
(it builds `{{ .SiteURL }}`). Confirm signup still needs the same edit; it can
only be proven by inviting a genuinely new address.

Also check:

- **Authentication → URL Configuration → Site URL** must be
  `https://www.livhold.com`. `{{ .SiteURL }}` builds the link above, and the
  apex `livhold.com` 308-redirects to `www`, so anything else sends people to
  the wrong origin.
- **Redirect URLs** should include `https://www.livhold.com/**`.

### While you are in there

The email says *"Open it on the device that asked for it."* That was never
quite right and is now unnecessary — after this change any device and any
browser works. Worth deleting so nobody follows advice that no longer applies.

## Step 3 — verify the TEMPLATE change (do not skip)

Step 1 is already verified in production; this is about Step 2. The failure
class is invisible from the happy path, so test it the way it actually broke:

1. Request a link in **Safari**.
2. Open the mail in the **Gmail app** and tap the button — deliberately the
   wrong browser.
3. You should land signed in on `/dashboard`.
4. Check the address bar afterwards: after step 2 it should carry **no**
   `access_token`. If it does, the template did not take.

Then confirm a legacy link still works: any sign-in email sent before this
change should still sign in when opened in the browser that requested it.
