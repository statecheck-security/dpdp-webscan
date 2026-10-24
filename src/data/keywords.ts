/**
 * English keyword lists (plan WS-3d, WS-4b, WS-5a). Matchers only: nothing
 * here is shown to a user. WS-3d adds the link lists used to pick the up to
 * 4 extra pages, WS-4a the identifiers W2 leaves out; the banner and text
 * lists follow in WS-4b and WS-5a.
 */

import type { PageReason } from '../types.js';

export interface PageLinkKeywords {
  reason: Exclude<PageReason, 'requested'>;
  /** Matched against the link's visible text (or aria-label / title). Preferred. */
  text: RegExp;
  /** Matched against the link's path when no link text matches. */
  path: RegExp;
}

/** In priority order: when more than 4 kinds are found, the later ones are dropped. */
export const PAGE_LINKS: readonly PageLinkKeywords[] = [
  {
    reason: 'privacy',
    text: /\bprivacy\b|\bdata protection\b|\bpersonal (data|information)\b/i,
    path: /privacy|data-?protection/i,
  },
  { reason: 'cookies', text: /\bcookies?\b/i, path: /cookie/i },
  { reason: 'contact', text: /\bcontact\b|\bget in touch\b|\breach us\b/i, path: /contact/i },
  {
    reason: 'grievance',
    text: /\bgrievances?\b|\bcomplaints?\b|\bredressal\b/i,
    path: /grievance|complaint|redressal/i,
  },
  { reason: 'terms', text: /\bterms\b|\bconditions\b/i, path: /terms|conditions|\btos\b/i },
];

/**
 * First-party identifiers W2 leaves out (WS-4a): session, CSRF, load-balancer
 * and bot-protection cookies, and the cookies a CMP uses to remember the
 * visitor's choice. Matched against the whole name. Third-party identifiers
 * always count, whatever their name.
 */
export const BENIGN_IDENTIFIERS: readonly RegExp[] = [
  // Sessions and CSRF
  /^PHPSESSID$/,
  /^JSESSIONID$/,
  /^ASP\.NET_SessionId$/,
  /^ASPSESSIONID[A-Z]+$/,
  /^connect\.sid$/,
  /^laravel_session$/,
  /^ci_session$/,
  /^csrftoken$/,
  /^XSRF-TOKEN$/i,
  /^_csrf(_token)?$/,
  /^csrf_token$/,
  /^__RequestVerificationToken$/,
  /^wordpress_test_cookie$/,
  // Load balancers and bot protection
  /^AWSALB(CORS)?$/,
  /^AWSELB$/,
  /^__cf_bm$/,
  /^cf_clearance$/,
  /^__cfruid$/,
  /^_cfuvid$/,
  // Consent state stored by a CMP
  /^OptanonConsent$/,
  /^OptanonAlertBoxClosed$/,
  /^CookieConsent$/,
  /^cookieyes-consent$/,
  /^didomi_token$/,
  /^euconsent-v2$/,
];
