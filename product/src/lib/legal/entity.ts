// The one place the legal pages get company facts from — /privacy and /terms
// both read this, so there is a single thing to edit and no chance of the two
// pages disagreeing about who operates the service.
//
// ⚠ THE `TODO_` VALUES BELOW ARE NOT FILLED IN YET. They are the facts only the
// owner has: the registered entity, its address, the contact address a data
// request goes to, and the jurisdiction. Google Play will not accept a privacy
// policy without a working contact route, and a policy naming the wrong entity
// is worse than none.
//
// Anything still starting with `TODO_` renders on the page as a loud inline
// marker rather than quietly printing the token (see `LegalValue`), so an
// unfinished page cannot be mistaken for a finished one in review.

export const LEGAL = {
  /** Registered company name, exactly as it appears on the register. */
  entity: 'TODO_COMPANY_LEGAL_NAME',
  /** Registered address, one line. */
  address: 'TODO_REGISTERED_ADDRESS',
  /** Where privacy questions and data requests go. Must be monitored. */
  contactEmail: 'TODO_CONTACT_EMAIL',
  /** Country whose law governs the Terms, e.g. 'Hungary'. */
  jurisdiction: 'TODO_JURISDICTION',
  /** Where the Supabase project is hosted, e.g. 'the EU (Frankfurt)'. */
  dataRegion: 'TODO_SUPABASE_REGION',

  /** Product name as users see it. */
  product: 'Livhold',
  /** Public origin, used in copy and for the canonical policy URL. */
  origin: 'https://www.livhold.com',
  /**
   * Shown as "Last updated". Bump it whenever the substance changes — Play
   * reviewers and users both read this as the freshness signal.
   */
  lastUpdated: '14 September 2026',
} as const

export function isUnset(value: string): boolean {
  return value.startsWith('TODO_')
}
