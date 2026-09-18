# Livhold auth email templates

Paste into **Supabase → Authentication → Email Templates**. Both use
`{{ .ConfirmationURL }}`, which matches the PKCE flow the app actually runs:
`signInWithOtp()` in `product/src/app/login/page.tsx` sets `emailRedirectTo`, Supabase
appends `?code=…`, and `product/src/app/auth/callback` exchanges it.

> ⚠️ **Editing a file here changes nothing on its own.** These are copies. There is
> no `supabase/config.toml` in this repo, so nothing links them to the project and no
> deploy carries them up — the version that actually goes out is whatever is pasted
> into the dashboard. After changing a template, paste it in, or it is a diff nobody
> receives. (Tracking them at all is half of the "put the email templates under
> version control" entry in `docs/NOTES.md`; the config.toml half is still open.)

| File | Supabase template | Who gets it |
|---|---|---|
| `confirm-signup.html` | **Confirm signup** | Any address with no account yet |
| `magic-link.html` | **Magic Link** | Returning travellers |

## Things that have already bitten us

- **Both templates matter.** `signInWithOtp()` creates the account, so a first-time
  address always gets *Confirm signup* — styling only *Magic Link* leaves every new
  traveller looking at Supabase's unbranded default.
- **Don't hardcode `type=`.** An earlier draft pointed at
  `/auth/confirm?token_hash=…&type=email`; the signup mail actually carries
  `type=signup`, and `/auth/confirm` feeds that value straight to `verifyOtp`, which
  needs the type the token was issued for. `{{ .ConfirmationURL }}` removes the
  question. If you ever go back to the token_hash flow, use `type={{ .Type }}` and add
  `/auth/confirm` to the redirect allowlist.
- **`{{ .SiteURL }}` is not the app's origin.** It's whatever Site URL is configured,
  which lagged a domain move once already and sent every link to the old Vercel host.
  `{{ .ConfirmationURL }}` follows `emailRedirectTo` instead.
- **PKCE links are origin-bound.** The code verifier lives in `localStorage` on the
  origin that requested the link, so a link opened in a different browser (requested on
  a laptop, tapped on a phone) fails the exchange and lands on `/auth/auth-code-error`.
  Both templates say "open it on the device that asked for it"; if that proves too
  sharp an edge for real travellers, the fix is the token_hash flow via `/auth/confirm`,
  which verifies server-side and has no such constraint.
- **Redirect allowlist.** Every origin the app is served from needs its
  `/auth/callback` in Auth → URL Configuration, because `emailRedirectTo` is built from
  `window.location.origin`. Both `livhold.com` and `www.livhold.com` are listed today
  (as `…/auth/callback**` — the wildcard matters, see `docs/NOTES.md` 2026-09-18).
- **Leave passwords out of these emails.** Signing up never involves one: a password is
  opt-in, set later from Account → Password by someone already signed in, and
  `signInWithPassword` only works for an account that has set one. *Confirm signup* used
  to end on "no password, ever", a promise about the future made to a reader who had not
  asked. Say what the link does and stop there.
- **Turning the password grant on adds a third template.** Supabase sends *Reset
  Password* for `resetPasswordForEmail()`, and there is no branded copy of it here —
  the first person to use the reset flow gets Supabase's unstyled default, which is
  the same gap that once made new travellers see an unbranded *Confirm signup*. Worth
  writing before the switch is flipped rather than after.
