// The one place the legal pages get company facts from — /privacy and /terms
// both read this, so there is a single thing to edit and no chance of the two
// pages disagreeing about who operates the service.
//
// ⚠ ONE VALUE IS STILL UNSET: `euRepresentative`. That one is not a missing
// fact but a missing appointment — nobody has been engaged yet — so it stays a
// marker until the real name and address exist. See docs/NOTES.md.
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
  contactEmail: 'privacy@keepyourhabits.com',
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
   * EU/EEA representative under Article 27 of the EU GDPR.
   *
   * REQUIRED, not optional, and not yet appointed. A UK company with no EEA
   * establishment that offers a service to people in the EEA must appoint one
   * and NAME IT IN THIS PRIVACY NOTICE — and this app's users and followers are
   * in Hungary, so the condition is plainly met rather than arguable.
   *
   * Until it is appointed the policy shows a marker here, which is the honest
   * state: the obligation exists and is unmet. See docs/NOTES.md.
   */
  euRepresentative: 'TODO_EU_REPRESENTATIVE',

  /** Product name as users see it. */
  product: 'Livhold',
  /** Public origin, used in copy and for the canonical policy URL. */
  origin: 'https://www.livhold.com',
  /**
   * Shown as "Last updated". Bump it whenever the substance changes — Play
   * reviewers and users both read this as the freshness signal.
   */
  lastUpdated: '16 September 2026',
} as const

export function isUnset(value: string): boolean {
  return value.startsWith('TODO_')
}
