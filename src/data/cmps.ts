/**
 * Known consent-management platforms (WS-4b): where each one puts its banner,
 * the container that also holds its preferences layer, and its floating
 * "change your choice" control. Selectors were written from the vendors'
 * published markup, not copied from any site; a missed CMP falls back to the
 * generic rule in src/banner.ts, so a wrong entry costs a vendor name, not a
 * banner. Hand-kept like src/data/trackers.ts (decision 9).
 */

export interface CmpSelectors {
  vendor: string;
  /** The first layer: the banner a visitor sees on arrival. */
  banner: string;
  /** Everything the banner can open (preferences layer included). Clicks stay inside it. */
  root: string;
  /** A persistent control for reopening consent settings, often shown only after a choice. */
  revisit?: string;
}

export const CMPS: readonly CmpSelectors[] = [
  {
    vendor: 'OneTrust',
    banner: '#onetrust-banner-sdk',
    root: '#onetrust-consent-sdk',
    revisit: '#ot-sdk-btn-floating, .ot-sdk-show-settings',
  },
  {
    vendor: 'Cookiebot',
    banner: '#CybotCookiebotDialog',
    root: '#CybotCookiebotDialog',
    revisit: '#CookiebotWidget',
  },
  {
    vendor: 'CookieYes',
    banner: '.cky-consent-container',
    root: '.cky-consent-container, .cky-modal',
    revisit: '.cky-btn-revisit-wrapper',
  },
  {
    vendor: 'CookieYes',
    banner: '#cookie-law-info-bar',
    root: '#cookie-law-info-bar, #cliSettingsPopup',
    revisit: '#cookie-law-info-again',
  },
  { vendor: 'Osano', banner: '.osano-cm-dialog', root: '.osano-cm-window', revisit: '.osano-cm-widget' },
  { vendor: 'Termly', banner: '[id^="termly-code-snippet-support"]', root: '[id^="termly-code-snippet-support"]' },
  { vendor: 'iubenda', banner: '#iubenda-cs-banner', root: '#iubenda-cs-banner', revisit: '.iubenda-tp-btn' },
  { vendor: 'Quantcast Choice', banner: '#qc-cmp2-container', root: '#qc-cmp2-container' },
  { vendor: 'Didomi', banner: '#didomi-notice', root: '#didomi-host' },
  { vendor: 'TrustArc', banner: '#truste-consent-track', root: '#truste-consent-track' },
  {
    vendor: 'Usercentrics',
    banner: '#usercentrics-root, #usercentrics-cmp-ui',
    root: '#usercentrics-root, #usercentrics-cmp-ui',
  },
  { vendor: 'Klaro', banner: '.klaro .cookie-notice', root: '.klaro' },
  { vendor: 'HubSpot', banner: '#hs-eu-cookie-confirmation', root: '#hs-eu-cookie-confirmation' },
  {
    vendor: 'Complianz',
    banner: '.cmplz-cookiebanner',
    root: '#cmplz-cookiebanner-container',
    revisit: '#cmplz-manage-consent',
  },
  { vendor: 'Cookie Notice (WordPress)', banner: '#cookie-notice', root: '#cookie-notice' },
];

/** A CMP that draws its banner inside an iframe, served from its own domain. */
export interface CmpFrame {
  vendor: string;
  /** Registrable domain the frame is served from; any subdomain matches. */
  host: string;
}

/**
 * CMPs whose first layer lives in an iframe (WS-11c). Only frames from these
 * domains, or from the scanned site itself, are ever searched or clicked: a
 * click inside another company's frame would be a click outside the banner.
 * Matched by the vendor's registrable domain because the exact subdomain
 * varies by product and region. Sourcepoint: `cdn.privacy-mgmt.com` per its
 * implementation guides (customers can CNAME it to their own domain, which the
 * same-site rule covers). TrustArc: its own domain; the subdomain is to be
 * confirmed in the WS-11e calibration round.
 */
export const CMP_FRAMES: readonly CmpFrame[] = [
  { vendor: 'Sourcepoint', host: 'privacy-mgmt.com' },
  { vendor: 'TrustArc', host: 'trustarc.com' },
];

/** A frame covering at least this share of the viewport counts as a banner layer even if not fixed. */
export const FRAME_MIN_COVERAGE = 0.3;

/**
 * Elements that may be (or sit inside) a banner when no CMP matched. A match
 * still has to look like a banner: visible, fixed or sticky or a dialog or
 * at the top of the page, with an accept or reject control and a consent
 * keyword (src/banner.ts).
 */
export const GENERIC_BANNER = [
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="consent" i]',
  '[class*="consent" i]',
  '[aria-label*="cookie" i]',
  '[aria-label*="consent" i]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
].join(', ');

/** Layers a preferences button can open outside the banner element itself. */
export const DIALOGS = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/** What counts as a control inside a banner. Plain links count only when their label names a choice. */
export const CONTROLS = 'button, [role="button"], input[type="button"], input[type="submit"], a[href]';
