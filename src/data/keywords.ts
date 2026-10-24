/**
 * English keyword lists (plan WS-3d, WS-4b, WS-5a). Matchers only: nothing
 * here is shown to a user. WS-3d adds the link lists used to pick the up to
 * 4 extra pages, WS-4a the identifiers W2 and W3 leave out, WS-4b the banner
 * lists; the text lists follow in WS-5a.
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
  /^addtl_consent$/,
  /^cookieconsent_status$/,
  /^cmplz_[a-z_-]+$/,
  /^_iub_cs-[\w-]+$/,
  /^osano_consentmanager(_uuid)?$/,
  /^klaro$/,
  /^__hs_opt_out$/,
  /^__hs_cookie_cat_pref$/,
  /^cookie_notice_accepted$/,
  /^CookieScriptConsent$/,
  /^notice_(preferences|gdpr_prefs|behavior)$/,
  /^cmapi_cookie_privacy$/,
  /^uc_(settings|user_interaction)$/,
];

/** Words that make a fixed box a consent banner rather than, say, a newsletter popup (WS-4b). */
export const BANNER_TEXT = /\bcookies?\b|\bconsent\b|\btrack(ing|ers?)\b|\bpersonal (data|information)\b|\bprivacy\b/i;

/**
 * Banner control roles by label, tried in this order, so "Accept only
 * necessary" is a reject and "Continue without accepting" is not an accept.
 */
export const BUTTON_ROLES: readonly { role: 'reject' | 'settings' | 'accept'; label: RegExp }[] = [
  {
    role: 'reject',
    label:
      /\b(reject|decline|refuse|deny|disagree|opt[ -]?out|no,? thanks)\b|\b(only|strictly) (the )?(necessary|essential|required)\b|\b(necessary|essential|required)( cookies)? only\b|\bcontinue without (accepting|agreeing)\b/i,
  },
  {
    role: 'settings',
    label: /\b(settings|preferences|manage|customi[sz]e|options|choices|let me choose|more info(rmation)?)\b/i,
  },
  { role: 'accept', label: /\b(accept|agree|allow|got it|ok(ay)?|yes|i understand|understood|continue)\b/i },
];

/**
 * On a preferences layer with no reject control: a control that saves the
 * choices as shown. Used only when no optional purpose is switched on there,
 * so saving cannot mean accepting.
 */
export const SAVE_CHOICES = /\b(save|confirm|submit)\b|\baccept selected\b|\ballow selection\b/i;

/** Banner sentences that treat browsing as consent (W5). */
export const IMPLIED_CONSENT =
  /\bby (continuing|using|browsing|staying|navigating|visiting)\b|\bcontinued use\b|\bif you continue\b|\byou (agree|consent) to (our|the) use of cookies\b/i;

/** A sentence that ties consent to a click is an affirmative action, never W5. */
export const CLICK_CONSENT = /\bby (clicking|selecting|pressing|tapping|choosing)\b/i;

/** Labels of a persistent control for changing consent later (W7), outside the banner. */
export const PERSISTENT_CONTROL =
  /\bcookie (settings|preferences|choices|consent)\b|\bprivacy (settings|choices|preferences)\b|\bmanage (cookies|consent|preferences|privacy)\b|\bconsent (settings|preferences|choices)\b|\bdo not sell\b|\bchange (my |your )?(cookie|consent|privacy) (settings|preferences|choices)\b|\b(revoke|withdraw) consent\b/i;
