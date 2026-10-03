# Brief: the app moves to app.livhold.com, the landing page takes livhold.com

Decided by Patrik, 3 Oct 2026. Written in the cloud session that moved Petra's landing page
into `landing/` (branch `kyh/trusting-sagan-a8d7q1`), for a session on Patrik's machine,
which has the Supabase CLI, the Vercel dashboard, Xcode and the Play and App Store consoles.

## The end state

| Address | Vercel project | Repository folder |
|---|---|---|
| `livhold.com` (and `www.livhold.com`) | new project `landing`, Root Directory `landing` | `landing/`: Petra's page now, the blog later, in the same project |
| `app.livhold.com` | the existing `asia-nomad-trip-planner` | `product/`: the web app, and later the origin the Android TWA wraps |
| `journey.livhold.com` | `landing` | permanent redirect (308) to `livhold.com` |
| none | none | `ios/`: unchanged apart from its web address |

Why now: Android ships as a TWA (`docs/PLATFORM-DECISION_2026-07-28.md`), and a TWA is tied to
one origin through `/.well-known/assetlinks.json`. No such file exists yet, so moving the origin
costs nothing on Play today and a new Play release later. Do this before any TWA work.

Patrik accepts that the five current users sign in again and reinstall the web app.

## Start here

1. Read `CLAUDE.md`, `landing/README.md`, `docs/landing-form/README.md` and the 3 Oct entry in
   `docs/NOTES.md`.
2. Branch `kyh/trusting-sagan-a8d7q1` holds `landing/` (the site, its `vercel.json`, smaller
   photos, the list form written in by `node tools/landing-form.mjs`). It is pushed, not
   merged, with no pull request yet. Build on it or merge it first.
3. Check everything in "What carries the old address" below yourself before changing it: it
   was found by grep, not by running anything.

## Order of work

Each step can be undone, and the app keeps working on its old address until step 5.

1. **The `landing` project, on journey.livhold.com only.** Create the Vercel project from this
   repository with Root Directory `landing`. Petra checks the preview on her phone and laptop.
   Then move the `journey` DNS record off ChatGPT's hosting onto it. This is the original
   reason for all of this (Cloudflare there blocked Petra on a Vietnam VPN), and it can go live
   before the rest.
2. **app.livhold.com next to livhold.com.** Add `app.livhold.com` to the existing app project
   while keeping `livhold.com` on it. In Supabase (production and staging), add
   `https://app.livhold.com/**` to the redirect allow-list without removing anything yet. Sign
   in at app.livhold.com by email code and by Apple, and open a follow link and an invite
   there.
3. **Code and configuration point at app.livhold.com** (one pull request, list below). Merge
   it with whoever is here, the usual way.
4. **Tell the five users** a day ahead: open the app once while online (offline changes are
   kept in the browser of the old address, see risks), then expect to sign in again at
   app.livhold.com and reinstall.
5. **The switch.** In the `landing` project, put in the redirects and the service-worker kill
   switch (below) first. Then move `livhold.com` and `www.livhold.com` from the app project to
   `landing`, and point `journey.livhold.com` at livhold.com with a 308. Test (the list at the
   end). **Rollback:** move the two domains back to the app project; nothing else needs undoing.
6. **After the switch.** Store consoles, push subscriptions, Supabase cleanup (below).

## What carries the old address (found by grep on 3 Oct)

The app uses `https://www.livhold.com` almost everywhere (on Vercel, `www` only redirects to
the apex).

- `supabase/config.toml`: `site_url = "https://www.livhold.com"` and
  `additional_redirect_urls`. Change `site_url` to `https://app.livhold.com`. Keep the old
  entries in the allow-list until step 6.
- `supabase/functions/digest/index.ts` and `digest-send/index.ts`: `FALLBACK_SITE` and the
  `SITE_URL` secret. Set the secret to `https://app.livhold.com`, change the fallbacks, and
  redeploy with the CLI. Check `stay-deadline-alerts` and `subscription-alerts` for links too:
  they carry only the `hello@livhold.com` sender, which stays.
- `supabase/email-templates/` (`confirm-signup.html`, `magic-link.html`) and
  `docs/AUTH-EMAIL-TEMPLATE.md`: any hard-coded link.
- `product/src/lib/legal/entity.ts`: `origin: 'https://www.livhold.com'`.
- `ios/Livhold/Auth/Backend.swift`: `production.web` is `https://www.livhold.com`, where a
  password reset lands. This needs a new iOS build. Tell the iOS agent through its "iOS:" line
  in NOTES.
- `tools/landing-form.mjs`: `ENDPOINT` becomes `https://app.livhold.com/api/journey-signup`.
  Re-run it. The route already allows requests from other origins.
- `landing/public/index.html`: the "Start using Livhold" buttons point at
  `https://livhold.com/dashboard`, and the footer at `/privacy` and `/terms`. Change them to
  `app.livhold.com`. Also change the JSON-LD and canonical URLs, which say
  `journey.livhold.com`, to `livhold.com`, along with `robots.txt` and `sitemap.xml`.
- `docs/PLAY-DATA-SAFETY.md` and `docs/APP-STORE-PRIVACY.md`: the privacy and account-deletion
  URLs (`www.livhold.com/privacy`, `/delete-account`). Update the files, then the consoles,
  to the final addresses. Do not rely on a redirect: a reviewer may reject one.
- The comments in `product/src/proxy.ts`, `api/journey-signup/route.ts`, `lib/journey/signup.ts`
  and `app/privacy/page.tsx` that say journey.livhold.com. `/privacy`'s heading "If you join the
  list on journey.livhold.com" becomes livhold.com (Patrik's "go", 3 Oct). Move "Last
  updated" to the day it goes live.
- Sign in with Apple on the web: `product/src/app/login/page.tsx` mentions Apple. If the web
  flow uses an Apple Services ID, register `app.livhold.com` as a domain and return URL with
  Apple. Not checked.
- Then grep the whole repository for `livhold.com` once more (outside `docs/NOTES.md`).

## The landing project at the switch

- **Redirects for every app path** (308, keeping the path and the query) to
  `https://app.livhold.com`, in `landing/vercel.json`. Follow links, invites, digest emails
  and password resets already sent all carry the old address. Build the list from
  `product/src/app`: every top-level route and every route in the `(app)` group (`dashboard`,
  `money`, `trip`, `reminders`, `account`, `welcome` and the rest), plus `login`, `auth`,
  `follow`, `invite`, `digest`, `goodbye`, `delete-account`, `privacy`, `terms`, `api`,
  `manifest.webmanifest`, `offline.html`. Add a small test that fails when a folder in
  `product/src/app` has no redirect.
- **Not `sw.js`.** Browsers refuse a redirected service-worker script, so the phones that
  installed the app would keep the old worker and keep serving the cached app on livhold.com.
  Serve a `landing/public/sw.js` that deletes every cache, unregisters itself and reloads its
  open windows. [Likely; test it on a phone with the app installed before the switch.]
- **Legal pages stay in the app** (Patrik, 3 Oct): `app.livhold.com/privacy`, `/terms`,
  `/delete-account`; livhold.com redirects to them, and the landing footer links straight there.

## Risks

- **Changes saved offline but not sent** stay in the old address's browser storage (the plan
  sync queue) and are not carried across. The user message in step 4 covers it. With five
  users, ask each one.
- **Push notifications stop.** `user_push_subscriptions` rows hold endpoints created on the old
  origin (`lib/trips/userPush.ts`, `lib/follow/push.ts`). After the switch everyone turns
  reminders on again at app.livhold.com. Delete the old endpoints once their sends fail.
- **The service worker's offline cache** precaches every file in `product/public` (Serwist's
  `globPublicPatterns` defaults to `**/*`). No landing files may go in there.
- **Cookies are per host**, so everyone signs in again. Accepted.

## After the switch

- Play Console and App Store Connect: the privacy and deletion URLs.
- Supabase: remove `www.livhold.com` and `livhold.com` from the redirect allow-list once a week
  passes with no sign-in landing there.
- When the TWA is built, `product/public/.well-known/assetlinks.json` goes on app.livhold.com.

## Test, right after the switch

- `livhold.com` and `www.livhold.com` show the landing page; `journey.livhold.com` arrives there.
- An old link (`www.livhold.com/follow/<token>`, an invite, `/dashboard`, `/privacy?x=1`) lands on
  the same path on app.livhold.com, query kept.
- Sign-in on app.livhold.com by email code and by Apple; the code email's link opens
  app.livhold.com.
- On a phone that had the app installed: livhold.com shows the landing page, not the cached app.
- The list form on livhold.com: one real submission appears in `journey_signups`.
- The iOS build: a password reset lands on app.livhold.com.

## Record

A NOTES entry for each step, with the "iOS:" line. CLAUDE.md's "Where the work stands" gets one
line when it is done. Hold the topic on a GitHub issue opened for it, with this checklist.
