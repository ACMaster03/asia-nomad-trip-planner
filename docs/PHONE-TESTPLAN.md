# 📱 Phone dogfood test plan

**App:** https://asia-nomad-trip-planner.vercel.app · **Date written:** 2026-07-24
**You need:** your iPhone, a second "follower" device (laptop browser in incognito is fine, Android is even better for push), ~40 minutes.
**Golden rule:** when something feels wrong, note the **flow number + what you saw** (screenshot if quick). Vague is fine — "F3.2 felt broken" is enough to dig from.

Everything here runs on the **production** app with your real account. Test trips created along the way are deleted at the end (F9).

---

## F1 · Fresh install & sign-in ⚠️ *highest-risk flow*

The installed home-screen app has **separate storage from Safari** — cookies, service worker, caches. Nothing done in Safari counts.

1. Delete any old compass icon from your home screen.
2. Safari → open the app URL → Share → **Add to Home Screen** → open it **from the icon**.
3. Sign in **inside the installed app**: enter your email → go to Mail → tap the magic link.
4. **⚠️ Watch closely:** does the link open **inside the installed app**, or does it bounce you to Safari?
   - Signed in *in the app* → ✅ carry on.
   - Signed in *in Safari but the installed app still shows the login screen* → **known iOS trap** (magic links can't always cross app contexts). Report it — the fix is a type-the-code sign-in, which I'll build next. You can still continue testing in Safari for this session.
5. Once signed in, stay online ~15 seconds and tap through Dashboard, Itinerary, Money, Live (if visible), Settings — this warms the offline cache AND registers the service worker.

**Expected:** standalone app (no Safari bars), compass icon, dark/light follows your system.

## F2 · Speed & feel

1. Tap between tabs — every tap should show the **loading skeleton instantly** (spinner + grey blocks), then content. No more dead 2–3s taps.
2. Close the app, wait 20+ minutes, reopen → the **first** load may take ~1–2s (free-tier cold start — expected). Everything after should be snappy.

**Report:** any navigation that still feels dead-slow *after* the first one, and roughly how long.

## F3 · Trip basics

1. Settings → **＋ New trip** → name "Phone test", **start date = today**, end date: try typing one directly (the field must be immediately active — no checkbox), then clear it → create.
2. **The Live tab must appear in the nav immediately** — no reload needed.
3. Settings → Active trip → switch back and forth between your real trip and "Phone test" — every screen should follow the switch, and Live should appear/disappear correctly (your real trip is pre-departure → no Live tab).

## F4 · Live check-ins & photos (on "Phone test")

1. Live → **Check in** → pick any place → notice **Visible to** defaults to *👨‍👩‍👧 Trip + followers*.
2. Attach 1–2 photos **with the camera** (the ＋ tile should offer camera directly). Add stars + a comment → save.
3. The check-in appears at the top of the feed instantly, photos as thumbnails.
4. Try **＋ Note** and **🛬 Arrived** quick actions.
5. **undo** on one event — it disappears.

**Report:** photo upload time on cellular, and whether thumbnails render.

## F5 · Airplane mode ✈️ *the big one*

Prereq: F1 step 5 done (cache warmed, SW registered), F3 trip active.

1. Airplane mode **ON**. Force-quit the app. Reopen from the icon.
   - **Expected:** the app loads from cache. Worst case for an unvisited screen: the teal **"You're offline 🧭"** page — never Safari's "no internet" error.
2. Live → offline banner shows → make a **check-in** (no photos — the picker warns photos need signal). It appears with **⏳ queued — will sync**.
3. Add a **note** too (two queued items).
4. **Force-quit again, still offline, reopen** → both items still there with badges. *(This proves the queue survives in storage — the most important step of the whole plan.)*
5. Airplane mode **OFF**, reopen the app, wait ~10s → badges disappear on their own.
6. On your **laptop**, open the app → same trip → Live: both events are there, **exactly once each** (duplicates = bug, missing = bug).

**Report:** the step number where anything deviates — especially step 1 (Safari error = SW still broken on iOS) and step 4 (lost queue).

## F6 · Money & auto-import (your **real** trip)

1. Switch active trip to your real trip → Money → Ledger.
2. If you have booked stays/transport with charge dates, the **"Import your N booked costs?"** card shows. Import them → rows get the **⤵ from plan** badge, dated by charge date.
3. Delete one imported row → confirm dialog explains it won't come back → it must **stay gone** (check again after a reload).
4. Change a booked stay's price in Itinerary → back to Ledger → the imported row follows the new amount.

## F7 · The family demo 👨‍👩‍👧 *(the M3 gate — the whole point)*

Traveller = your iPhone ("Phone test" trip active). Follower = laptop incognito window or another device.

1. iPhone: Settings → Follow links → **＋ Create follow link** → copy it (shown once!).
2. Follower device: open the link **without signing in** →
   - "Phone test" (started today) → **live view**: globe flies to the route, current-stop card, feed with your F4 check-in + photos.
   - Also try a link for your **real** trip → **countdown page** ("XX days until departure").
3. **Sanitization spot-check:** on the follower page there must be *zero* money, booking names/references, or your trip-only events. Dev-tools curiosity welcome — there's nothing more to find.
4. **Push:** follower page → 🔔 card → **Enable push notifications** (works directly on laptop Chrome/Firefox/Edge or Android; an iPhone follower must first Add to Home Screen).
5. iPhone: make a new check-in with photo → follower device should get the **notification within ~seconds** and the page updates within ~45s. Tap the notification → it opens the follow page.
6. iPhone: Settings → **Revoke** the link → follower refreshes → **"This link isn't active"**, and further check-ins send **no** notification.

## F8 · Deadline alert email *(passive — optional)*

Your real booked stay has cancel/charge dates. On the right T-7/T-3/T-1 morning (07:00 UTC ≈ 09:00 home time) an email lands at patrikgrohmann@gmail.com. Nothing to do now — just notice whether it arrives on the right day, once.

## F9 · Cleanup

- Settings → **Danger zone** → *Delete trip…* → type the trip's name → delete the "Phone test" trip.
  (This step was impossible until 2026-07-26 — `deleteTrip` did not exist, so **the test trips from
  the 07-24 pass are still in production** and should be cleaned up on the next run.)
- Revoke any leftover test follow links.
- Keep the PWA installed — it's the real thing now.

---

## Reporting shorthand

| Flow | What matters most |
|---|---|
| F1 | did magic-link sign-in stay inside the installed app? |
| F2 | any dead taps left, cold-start feel |
| F5 | step 1 (no Safari error) and step 4 (queue survives force-quit) |
| F7 | notification arrives; revoke kills everything |

Anything that annoys you counts as a finding too — "works but feels wrong" is exactly the dogfood we want before Bangkok. 🛫
