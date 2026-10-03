> **Status, 1 Oct 2026.** Kept as received from Patrik and Petra. Two things
> turned out differently from section 2 and are handled in `README.md` here:
> journey.livhold.com is a hosted page, not a repository, so the form is pasted
> in rather than ported, and it posts to `https://livhold.com/api/journey-signup`
> (no Supabase key in the page) instead of straight to Supabase. livhold.com's
> privacy policy exists in English only (localisation is #119), so section 3's
> Hungarian text waits for that round.

# PR brief: journey.livhold.com list form + privacy policy update

**For:** Patrik + Petra, and the Claude Code agent doing the implementation
**Source file:** `livhold-journey-form.html` (sits next to this brief)
**Rule:** the form and the privacy-policy update ship in the **same PR**. Do not deploy the form before the policy text is live.

---

## 1. What the form is

A light card in the closing section of journey.livhold.com, under "Start using Livhold". It collects:

| Field | Name sent | Required |
|---|---|---|
| When are you heading off? (4 choices) | `when` | yes |
| How long will you be away? (4 choices) | `length` | yes |
| How do you plan it today? | `plan_today` | no |
| First name | `first_name` | no |
| Email | `email` | yes |
| "I'm up for a 20-minute video call" (unticked by default) | `call_ok` | no |
| Added automatically | `source`, `consent_text_version`, `submitted_at` | – |

It has a hidden spam-trap field (`website`), handles missing answers, failed sending and offline, and shows a thank-you (with a different line when the call box is ticked).

---

## Where the files are

On Petra's Mac (iCloud, LIVHOLD folder). This is **not** the git repo, so copy them in:

- `/Users/Petra/Library/Mobile Documents/com~apple~CloudDocs/LIVHOLD/landing-form/livhold-journey-form.html`
- `/Users/Petra/Library/Mobile Documents/com~apple~CloudDocs/LIVHOLD/landing-form/livhold-form-PR-brief.md` (this file)
- Brand reference: `/Users/Petra/Library/Mobile Documents/com~apple~CloudDocs/LIVHOLD/livhold-brand.md`

Suggested home in the repo: `docs/landing-form/`.

---

## 2. Code tasks (Claude Code agent)

1. **Find the repo that serves journey.livhold.com** and the one that serves livhold.com/privacy. They may be different repos (unconfirmed). The Vercel team has `asia-nomad-trip-planner` and `web-landing-page`.
2. **Embed the form.** Copy everything between `COPY FROM HERE` and `COPY TO HERE` in `livhold-journey-form.html` into the closing section, directly under the "Start using Livhold" button. The block is self-contained (scoped `.lh-*` CSS + its own script). Everything outside the markers (the dark mock page, the "Preview a state" bar, the preview script) is preview-only: do not ship it.
   - If the site is a framework (React/Next), port it as a component. Keep the markup, class names, copy and behaviour identical, and keep validation on the button's `click` (not only `submit`): that was deliberate, so it works in sandboxed embeds.
3. **Add the hero link** under "Start your journey": `<a href="#tell-us">Leaving later? Tell us when →</a>` (smooth scroll, respect `prefers-reduced-motion`).
4. **Create the Supabase table** (insert-only for the public key):

   ```sql
   create table public.journey_signups (
     id uuid primary key default gen_random_uuid(),
     "when" text not null check ("when" in ('on_the_move','next_3_months','later','someday')),
     length text not null check (length in ('1_3_months','3_6_months','6_plus_months','open_ended')),
     plan_today text check (char_length(plan_today) <= 1000),
     first_name text check (char_length(first_name) <= 80),
     email text not null check (char_length(email) <= 200),
     call_ok boolean not null default false,
     source text,
     consent_text_version text not null,
     submitted_at timestamptz not null,
     created_at timestamptz not null default now()
   );
   alter table public.journey_signups enable row level security;
   create policy "anon can insert" on public.journey_signups
     for insert to anon with check (true);
   -- no select/update/delete policies: the public key can only write
   ```

5. **Fill in `CONFIG`** at the top of the form's script:
   - `endpoint`: `https://<project-ref>.supabase.co/rest/v1/journey_signups`
   - `headers`: `{ apikey: "<anon key>", Authorization: "Bearer <anon key>", Prefer: "return=minimal" }`
   - `privacy`, `terms` and `privacyEmail` are already set (livhold.com/privacy, livhold.com/terms, support@keepyourhabits.com).
6. **Footer of journey.livhold.com:** add "Privacy" and "Terms" links. There are none today.
7. **Deletion job:** delete rows older than the retention period you choose in section 4 (e.g. a scheduled `delete from journey_signups where created_at < now() - interval '12 months'`).
8. **Test before merging:** one real submission lands in the table; empty submit shows all three messages; a blocked endpoint shows "That didn't go through" and keeps the answers; check at phone width.

---

## 3. Privacy policy changes (same PR, English + Hungarian)

The current policy (livhold.com/privacy, "Last updated 16 September 2026") covers app accounts only. It says nothing about a sign-up list or call invites. Add the following, in the policy's existing plain "we/you" style.

**New section, after "What we store":**

> **If you join the list on journey.livhold.com**
>
> The form on journey.livhold.com asks when you're leaving, for how long, how you plan today, your email and, if you like, your first name. If you tick the box, it also notes that you're happy to have a 20-minute call.
>
> We use this for three things only: to email you when Livhold opens to everyone, to understand how people plan long trips, and, only if you ticked the box, to get in touch about a call. We don't use it for advertising, we don't sell it, and we don't add you to anything else.
>
> We're allowed to hold it because you gave it to us for these reasons (your consent). You can withdraw that consent at any time: use the unsubscribe link in any email, or write to support@keepyourhabits.com and we'll delete your answers.
>
> If we talk on a call, we take short written notes. We don't record calls unless we ask you first and you say yes.

**Add to "Who else touches it":**

> Supabase stores the form answers. *[+ the email tool and video tool you'll use, see section 4]*

**Add to "How long it is kept, and how to end it":**

> List answers and call notes are deleted 12 months after you send them, or sooner if you ask. If you create a Livhold account, your account follows the rules above instead.

**Update "Last updated"** to the go-live date. The form sends `consent_text_version: "2026-10-01"`; if the small print under the button ever changes, bump that value too, so each row records which wording the person agreed to.

**Hungarian version:** needs the same three additions. Petra to translate or review.

---

## 4. Decisions needed before the PR merges (Patrik + Petra)

- [ ] **Email tool for the launch email and call invites.** If it's Google Workspace (keepyourhabits.com), add Google to "Who else touches it". If it's Resend, it's already listed.
- [ ] **Video tool for calls** (Google Meet, Zoom…): add it to "Who else touches it".
- [ ] **Retention period.** 12 months is a suggestion; choose what you'll actually enforce, and match the deletion job to it.
- [ ] **Unsubscribe link** in every email you send to the list (needed for the "withdraw consent" promise).
- [ ] **NAIH.** The policy names the UK ICO as the regulator people can complain to. Consider also naming NAIH (Hungarian authority) for EU residents, since you target Hungarian users.
- [ ] **Optional:** a short review of the new text by someone qualified before launch.

---

## 5. Brand alignment (checked against `livhold-brand.md`)

- Already aligned: Lora headings / Work Sans body, hunter `#3F5A3E` primary, mauve `#A94C5A` accent, paper `#F5F2EA`, card radius 22, controls 20, pills fully round, 44px min hit targets, legal links mauve-deep `#93404C` underlined weight 500, enter motion `.3s cubic-bezier(.2,.7,.2,1)`.
- **Error colour = brand amber `#8A6420` (`--warn`)**, decided by Patrik + Petra. Amber now covers both warnings and form errors; no new colour enters the palette. The form's internal variable is still called `--wine` (historical): map it to `--warn` when porting. The pale fill `#f5ebd3` is a little stronger than `--warnSoft` on purpose, so the box reads on cream.
- Amber text is ~4.5–4.8:1 on its backgrounds, just over WCAG AA. Keep error text at 14px semi-bold or larger; don't lighten it.
- **When porting, swap hard-coded hex values for the repo tokens** in `product/src/app/globals.css` (`--ac`, `--ac2`, `--ac2Deep`, `--warn`, `--tx`, `--ln2`, `--paper`, `--r`, `--rCtl`…).
- The form is light-only (a cream card on the dark page). If the site gains a light/dark toggle later, it needs a dark variant.

---

## 6. Already decided (don't reopen in review)

- Form lives **on the page**, not in a popup.
- Light card on the dark page; centred heading, button and small print; questions left-aligned.
- Button: **"Count me in"**. Title keeps its full stop, no exclamation marks.
- After a call opt-in, **we** reach out to agree a time: no booking link.
- Errors use brand amber `#8A6420` with a full outline (2px) and no side stripe; mauve `#A94C5A` stays the brand accent.
