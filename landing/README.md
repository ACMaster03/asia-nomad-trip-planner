# journey.livhold.com, the landing page

Petra's design, moved here on 3 Oct 2026 from ChatGPT's hosting (`chatgpt.site`), which sits
behind Cloudflare and blocked Petra on a Vietnam VPN. Travellers in Asia on a VPN are the
people this page is for, and nobody could see or change who got blocked.

- `public/` is the whole site, served as is: no build, no framework. `index.html`, `style.css`,
  `app.js`, `assets/`, the icons and `fonts/`.
- `vercel.json` is for a Vercel project of its own with **Root Directory `landing`**. It
  rebuilds only when something under `landing/` changes.
- **The list form** sits between the `lh-form` markers in `public/index.html`. Do not edit it
  there: edit `docs/landing-form/livhold-journey-form.html` and run
  `node tools/landing-form.mjs`, which rewrites both the page and the paste file.
- **Fonts** (Lora, Work Sans, SIL Open Font License) are served from `public/fonts/`, Latin
  and Latin Extended only, so a visitor's browser calls no one but this site and, when the
  form is sent, `app.livhold.com`. The policy names no font host; keep it that way.
- **Image credits**: `ASSET-CREDITS.md`.
- **Redirects to the app** (`vercel.json`, step 5 of `docs/APP-MOVE-BRIEF.md`, #163): every
  path the web app serves (its route folders, `product/public`, `/_next`) answers with a 308 to
  the same path on `https://app.livhold.com`, query kept, so links already sent keep working
  once this project serves livhold.com. `node --test landing/redirects.test.mjs` (from the
  repository root) fails when a new app folder has no redirect: add one here when you add a
  screen to the app.
- **`public/sw.js` is a kill switch**, not a service worker for this page: it replaces the
  app's old worker on phones that installed the app from livhold.com, clears its caches,
  unregisters and reloads. The page never registers it. Do not delete it while anyone may
  still have the old install (months).

Changed from the ChatGPT export: the app's links go to `https://app.livhold.com` (since step 3
of `docs/APP-MOVE-BRIEF.md`; the form first since #165, so only Privacy, Terms and the form's
endpoint); the hero link "Leaving later? Tell us when →", the form, and Privacy and
Terms in the footer were added (`docs/landing-form/README.md`); the form has no text shadow
(the closing section gives its own text one); the button-directions page
(`buttons.html`, `button-lab.css`), the export's deploy note and twelve photos the page never
loads were left out; the rest were made smaller (at most 2200 px wide, JPEG quality 80).

To look at it locally: `cd landing/public && python3 -m http.server 8765`, then
`http://localhost:8765`.
