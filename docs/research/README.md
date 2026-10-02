# Research — what people say about apps like Livhold

Started 2 Oct 2026. Patrik's ask; Petra's weekly task. Patrik decides what we do with it.

## What this is

People write on Reddit (and elsewhere) about the apps they use on a trip: what they plan
with, what they count money with, how family follows along, where they keep the diary.
They say what works, what annoys them, and what nobody has built.

We keep what they say here, in their words, so that later we can answer two questions:

1. **Product:** what do people need that Livhold does not do yet? And what does Livhold
   do that nobody asks for?
2. **Positioning:** how do people describe this kind of app, and which words do they use?
   (Positioning is the one sentence that says who Livhold is for and why it is different
   from the rest.)

## Why text, not screenshots

Claude cannot open Reddit from where it runs: the site blocks it. And a screenshot cannot
be searched. So the record is **text**: the link, and what people wrote, word for word.
A screenshot is fine to paste into the chat; Claude types it out into the source file.
The screenshot itself is not kept.

## The files

| File | What goes in it | Who writes it |
|---|---|---|
| `sources/S-NN-<name>.md` | One file per thread: the link, the post, what people said, word for word. Not rewritten later. | Claude, from what Petra pastes; Petra checks |
| `needs.md` | One entry per thing people want or hate. Each has the quotes that prove it and the sources that say it. The number of an entry never changes. | Claude proposes; Petra checks |
| `competitors.md` | One section per app people name: what they praise, what they complain about. Only what people say, not what we think. | Claude proposes; Petra checks |
| `takeaways.md` | What it means for Livhold, dated. Patrik decides. | Patrik, with Claude |

`sources/TEMPLATE.md` is the empty shape of a source file.

## The weekly routine (Petra)

1. Find a thread. Good signs: many comments, people naming apps, people saying what they
   wish existed. Recent is better than old; a thread from 2020 describes the apps of 2020.
2. Copy the **link**. Then copy the **text** of the post and of the comments that matter:
   the ones with upvotes, the ones that name an app, the ones that say "I wish…". Or take
   screenshots of them.
3. Paste it all into the chat with Claude and say "new source".
4. Claude writes the source file and proposes new lines for `needs.md` and
   `competitors.md`. Read them. If a quote is wrong, say so.
5. Claude saves and sends the work to GitHub, then asks for it to be taken into the main
   copy. The words for this:
   - a **branch** is a separate copy of the project where changes are made without
     touching the live one;
   - a **commit** is a saved step, with a note saying what changed;
   - **push** sends the saved steps to GitHub, where the project lives;
   - a **pull request** asks for the changes to be taken into the main copy. Patrik or
     Petra accepts it; that is a **merge**.
6. Every few sources, or once a week, Claude writes a short note at the top of
   `takeaways.md`: what is new, what repeats, what we would change. Patrik reads it and
   decides.

Nothing in this folder changes the app. Merging it is safe.

## Rules for capturing

- Quotes word for word. Spelling mistakes stay. Cut with "…" where you skip.
- Keep the upvote count next to a quote when it is visible. It says how many agreed.
- No usernames. Write "the poster" or "a commenter".
- Say which **job** the thread is about: `plan` (the route, stays, transport), `money`
  (spending, budget), `follow` (family watching along), `diary` (check-ins, photos,
  memories), or `other`. One thread can have several.
- Write what people say, not what we conclude. Conclusions go in `takeaways.md`.
- A thread that says nothing new still gets a source file: it adds to the counts.
- Reddit is one kind of person: someone who cares enough to post, often to complain.
  Count it as a signal, not as a survey of everyone.

## Names you may meet

Apps people often name in these threads. The list is here so you recognise them; check
what the thread actually says about each.

- Planning: Wanderlog, TripIt, Google Maps lists, Notion or a spreadsheet, Lambus.
- Money: TravelSpend, Trail Wallet, Splitwise, Tricount, a spreadsheet.
- Diary and following along: Polarsteps, FindPenguins, Instagram, a WhatsApp group.
