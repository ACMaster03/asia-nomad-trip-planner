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
  form is sent, `livhold.com`. The policy names no font host; keep it that way.
- **Image credits**: `ASSET-CREDITS.md`.

Changed from the ChatGPT export: links go to `https://livhold.com` (the `www` address only
redirects there); the hero link "Leaving later? Tell us when →", the form, and Privacy and
Terms in the footer were added (`docs/landing-form/README.md`); the form has no text shadow
(the closing section gives its own text one); the button-directions page
(`buttons.html`, `button-lab.css`), the export's deploy note and twelve photos the page never
loads were left out; the rest were made smaller (at most 2200 px wide, JPEG quality 80).

To look at it locally: `cd landing/public && python3 -m http.server 8765`, then
`http://localhost:8765`.
