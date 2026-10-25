/**
 * Check ids the engine can emit. The wording, provisions and certainty labels
 * live in scs (`src/data/scan/checks.ts`, see the plan, WS-1). This list must
 * match the scs catalogue for CATALOGUE_VERSION; a drift test will compare the
 * two when `../scs` is checked out (same approach as scs's legal-rules drift check).
 */

export const CATALOGUE_VERSION = '2026-10-25-r2';

export const CHECK_IDS = [
  'W1', // third-party trackers before any interaction
  'W2', // identifiers set before any interaction
  'W3', // trackers still fire after "reject"
  'W4', // no reject option on the first layer
  'W5', // consent inferred from browsing
  'W6', // pre-ticked consent box on a form
  'W7', // no visible way to change or withdraw consent later
  'W8', // session replay / keystroke capture on a page with a form
  'W9', // form submits personal data to a third-party host
  'W10', // personal-data form not over HTTPS
  'W11', // personal data in the URL (GET form)
  'W12', // contact for privacy questions not found
  'W13', // means to make rights requests not found
  'W14', // grievance response period not published, or over 90 days
  'W15', // no mention of complaining to the Board
  'W16', // no explanation of how to withdraw consent
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

/** Information-only observations: no provision, no label. */
export const INFO_IDS = [
  'banner', // banner present/absent and vendor
  'site-cookies', // login/security/consent-state identifiers left out of W2 (WS-2 review)
  'third-party-locations', // where third parties are (S.16: nothing restricted)
  'notice-languages', // languages offered (S.5(3))
  'coverage', // pages scanned and what blocked us
] as const;

export type InfoId = (typeof INFO_IDS)[number];
