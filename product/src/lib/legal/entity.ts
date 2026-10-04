// The one place the legal pages get company facts from — /privacy and /terms
// both read this, so there is a single thing to edit and no chance of the two
// pages disagreeing about who operates the service.
//
// Anything still starting with `TODO_` renders on the page as a loud inline
// marker rather than quietly printing the token (see `LegalValue`), so an
// unfinished page cannot be mistaken for a finished one in review.

export const LEGAL = {
  /** Registered company name, exactly as it appears on the register. */
  entity: 'KeepYourHabits Ltd',
  /**
   * Registered address, exactly as filed at Companies House for company number
   * 17055436 — taken from the register itself rather than from memory, because
   * this is also the address the ICO entry carries and the policy must not
   * disagree with the regulator. Re-check it if the registered office moves.
   */
  address: '66 Paul Street, London, England, EC2A 4NA',
  /**
   * Where privacy questions and data requests go. A role address rather than a
   * personal one, so it survives a change of staff and reads as a route rather
   * than someone's inbox. It only does its job if mail to it is actually read:
   * Play requires a working contact route, and a GDPR request arriving here
   * starts a one-month clock whether or not anyone is looking.
   */
  contactEmail: 'support@keepyourhabits.com',
  /**
   * Law governing the Terms. KeepYourHabits Ltd is London-based, and England &
   * Wales is the legal system covering London — confirmed with the owner
   * 2026-09-14, so this is settled rather than assumed. (Scotland and Northern
   * Ireland would each have been a different answer.)
   */
  jurisdiction: 'England & Wales',
  /**
   * Where the Supabase project is hosted. Read off the project itself
   * (`supabase projects list`) rather than recalled: prod `Nomad_Trip_Planner`
   * runs in `eu-west-1`, which is AWS Ireland. Vercel serves from Dublin, so
   * every provider holding data is in the same country — which is why the
   * policy's transfers section names one place and not two.
   */
  dataRegion: 'Ireland',

  /**
   * EU representative under Article 27 of the EU GDPR. Patrik's decision,
   * 3 Oct 2026: himself, the Ltd's director, who lives in Hungary, until a
   * separate representative is worth paying for (revisit when the apps earn).
   * Replaces the 28 Sep designation of Petra. The same line is on
   * keepyourhabits.com/privacy (WebLandingPage, src/config/legal.ts).
   */
  euRepresentative: 'Patrik Grohmann',
  euRepresentativeAddress: 'Őzgida utca 16-20, 1025 Budapest, Hungary',
  euRepresentativeEmail: 'support@keepyourhabits.com',

  /**
   * The list on journey.livhold.com (migration 44, docs/landing-form): how the
   * list is USED, each named in "Who else touches it". Decided by Patrik on
   * 2 Oct 2026: the automated email when Livhold opens goes through Resend,
   * already a processor here (a hand-written round from the mailbox instead,
   * if the list is small); a call is arranged by ordinary email from our own
   * mailbox, no booking tool, and runs on Google Meet. 3 Oct 2026 (Patrik): the
   * list's email is no longer one launch email but updates on the development
   * and its phases, including the opening (consent_text_version 2026-10-03). `mailbox` is the one
   * of the three nobody has read off a bill: the brief says keepyourhabits.com
   * is on Google Workspace; change it here if that is wrong.
   */
  listEmailTool: 'Resend',
  mailbox: 'Google Workspace',
  callTool: 'Google Meet',

  /** Product name as users see it. */
  product: 'Livhold',
  /** Public origin, used in copy and for the canonical policy URL. */
  origin: 'https://www.livhold.com',
  /**
   * Shown as "Last updated". Bump it whenever the substance changes — Play
   * reviewers and users both read this as the freshness signal.
   */
  lastUpdated: '4 October 2026',
} as const

export function isUnset(value: string): boolean {
  return value.startsWith('TODO_')
}
