# Livhold auth email templates

Paste into **Supabase → Authentication → Email Templates**. Both use
`{{ .ConfirmationURL }}`, which matches the PKCE flow the app actually runs:
`signInWithOtp()` in `product/src/app/login/page.tsx` sets `emailRedirectTo`, Supabase
appends `?code=…`, and `product/src/app/auth/callback` exchanges it.

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
  `window.location.origin`. Both `livhold.com` and `www.livhold.com` are listed today.
