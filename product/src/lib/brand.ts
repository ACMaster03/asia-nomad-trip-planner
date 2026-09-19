// The one place brand copy is written down. Same reasoning as `LEGAL` in
// lib/legal/entity.ts: these strings ship on surfaces that are edited months
// apart, and when each surface owns its own literal they drift.
//
// They had. Before this file the app described itself three different ways —
// the HTML meta description sold co-editing, the PWA install card sold
// followers ("Plan the trip, live the trip, let them follow."), and the design
// handoff called it a "two-editor travel planning + memory app". A search
// result and an install prompt for the same product disagreed about what it is.

export const BRAND = {
  /**
   * The motto. Lowercase and letter-spaced (.06em) wherever it renders — the
   * design handoff (design/handoff-v1/README.md) fixes both, so it is never
   * sentence-cased on its own. The one exception is `intro` below, where it
   * opens a sentence and takes a capital.
   *
   * Also hard-coded in supabase/email-templates/*.html, which are static files
   * served by Supabase and cannot import from here. Change one, change those.
   */
  tagline: 'the living journey, held together',
  /**
   * How Livhold introduces itself in one sentence: motto, then the thing that
   * makes it different. Co-editing leads because the handoff names it as *the*
   * differentiator — "more than one person can be a full co-editor of a trip".
   *
   * This is the meta description, so it is what Google, iMessage and Slack
   * render for a link. Keep it one line and under ~160 characters or search
   * results truncate it mid-thought.
   */
  intro:
    'The living journey, held together. Plan a long trip with a co-editor and hold on to it as you live it.',
} as const
