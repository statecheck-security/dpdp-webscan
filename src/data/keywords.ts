/**
 * English keyword lists (plan WS-3d, WS-4b, WS-5a). Matchers only: nothing
 * here is shown to a user. WS-3d adds the link lists used to pick the up to
 * 4 extra pages, WS-4a the identifiers W2 and W3 leave out, WS-4b the banner
 * lists, WS-4c the form lists, WS-5a the text lists (W12–W16).
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

/**
 * Laravel names its session cookie `<app name, slugged with _>_session`; a custom name such as
 * `shopname_session` was counted as W2 on a real scan (2026-10-25). A name that shape is a session
 * cookie only on a Laravel site, which always sets LARAVEL_CSRF next to it (src/checks/evidence.ts):
 * on its own, `site_session` could be anything.
 */
export const LARAVEL_SESSION = /^[a-z0-9]+(_[a-z0-9]+)*_session$/;
export const LARAVEL_CSRF = /^XSRF-TOKEN$/;

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

/** Field name, id, placeholder or aria-label hints that the field asks for personal data (WS-4c). */
export const PERSONAL_FIELD =
  /e-?mail|phone|mobile|\btel\b|whats-?app|(^|[\s_-])name($|[\s_-])|first.?name|last.?name|full.?name|surname|address|pin.?code|postal|\bzip\b|\bpan\b|aadha?ar|\bdob\b|birth/i;

/** autocomplete tokens for personal data (HTML autofill field names). */
export const PERSONAL_AUTOCOMPLETE =
  /^(name|given-name|family-name|additional-name|email|tel|tel-national|street-address|address-line[123]|postal-code|bday)$/;

/** A checkbox whose label or name reads as consent, agreement or opting in (W6). */
export const CONSENT_CHECKBOX =
  /\bconsent\b|\bagree\b|\baccept\b|\bsubscribe\b|newsletter|marketing|\boffers?\b|promotion|\bupdates\b|communicat|whats-?app|\bsms\b|\bcall me\b|\bcontact me\b|opt.?in|\bterms\b|\bprivacy\b/i;

/** The single field of a search form, which is never a personal-data form. */
export const SEARCH_FIELD = /^(q|s|query|search|keywords?|term)$/i;

/**
 * W12: a published contact for questions about personal data (Rule 9). A
 * `mailto:` link on a privacy or contact page also counts (src/checks/published.ts).
 */
export const PRIVACY_CONTACT: readonly RegExp[] = [
  /\bgrievance officer\b/i,
  /\bdata protection officer\b/i,
  /\bDPO\b/,
  /\b(privacy|dpo|grievance|dataprotection|data-protection)@/i,
  // "Questions about … privacy / personal data": nav text ("Privacy Policy | Contact us") never says that.
  /\bquestions?\b.{0,40}\b(privacy|personal (data|information)|data protection)\b/i,
];

/** W13: the means to ask for access, correction, erasure or nomination (Rule 14(1)(a), S.11–14). */
export const RIGHTS_MEANS: readonly RegExp[] = [
  /\brequest\b.{0,30}\b(access|correct(ion)?|eras(e|ure)|delet(e|ion)|updat(e|ing))\b/i,
  /\bexercise (your|these|any of (your|these)|the) rights\b/i,
  /\bnominat(e|ion)\b/i,
  /\bright to (access|correction|erasure|grievance redressal|nominate)\b/i,
  /\b(access|correct|update|erase|delete) (your|the) personal (data|information)\b/i,
];

/** W14: words that tie a period to grievances, when the page itself is not a grievance page. */
export const GRIEVANCE_WORDS = /\bgrievances?\b|\bcomplaints?\b|\bredress(al)?\b/i;

/**
 * W14: words just before a period that make it the time to respond to or resolve a grievance, rather
 * than to acknowledge one or to keep records ("we resolve complaints within 30 days").
 */
export const RESPONSE_WORDS =
  /\b(resol(ve|ved|ves|ving|ution)|respon(d|ds|ded|ding|se)|redress(ed|al)?|dispos(e|ed|al)|address(ed|ing)|repl(y|ies|ied)|decid(e|ed)|decision|settle(d|ment)?|clos(e|ed|ure))\b/i;

/** Number words W14 understands in a period ("within thirty days"); src/checks/published.ts builds its pattern from them. */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  a: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  ten: 10,
  fourteen: 14,
  fifteen: 15,
  twenty: 20,
  'twenty-one': 21,
  'twenty one': 21,
  thirty: 30,
  'forty-five': 45,
  'forty five': 45,
  sixty: 60,
  ninety: 90,
  'one hundred twenty': 120,
  'one hundred and twenty': 120,
  'one hundred eighty': 180,
  'one hundred and eighty': 180,
};

/** W15: a mention of complaining to the Board (S.5(1)(iii), Rule 3(c)(iii)). */
export const BOARD_COMPLAINT: readonly RegExp[] = [/\bData Protection Board\b/i];

/** W16: withdrawing consent, said in the same sentence as how (S.5(1)(ii), S.6(4)). */
export const WITHDRAW_CONSENT = /\bwithdraw\w*\b.{0,40}\bconsent\b|\bconsent\b.{0,40}\bwithdraw\w*\b/i;
export const WITHDRAW_HOW =
  /\b(e-?mail\w*|write|writing|click\w*|settings|link|contact\w*|form|unsubscribe|button|toggle|preferences|dashboard|account)\b/i;

/**
 * WS-3g: free extra-page slots go first to pages that probably hold a form
 * (forms are only inspected on pages we load), by link text or path.
 */
export const FORM_PAGE_LINKS = {
  text: /\b(assessments?|quotes?|sign ?up|register|registration|get started|book(ing)?|enquir(e|y)|inquir(e|y)|apply|application|demo|free trial|request a (call|callback)|audit|consultation)\b|\bfree\s+(\w+\s+){0,2}(check|audit|consultation|assessment|trial|demo)\b/i,
  path: /assess|quote|sign-?up|regist|get-started|book|enquir|inquir|apply|demo|trial|audit|consult/i,
};

/** Never used to fill a slot: files, and pages behind or about an account (WS-3g). */
export const SKIPPED_PAGE_PATHS = [
  /\.(pdf|docx?|xlsx?|pptx?|csv|zip|rar|7z|gz|tar|jpe?g|png|gif|webp|svg|ico|mp4|webm|mov|mp3|wav|apk|exe|dmg|xml|json|txt)$/i,
  /(^|\/)(log-?in|log-?out|sign-?in|sign-?out|wp-login(\.php)?|wp-admin|admin|account|my-?account|profile|cart|basket|checkout)(\/|$)/i,
] as const;
