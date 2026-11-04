/**
 * Google Consent Mode signal (WS-11j, plan decision 34): the single named
 * exception to "hostnames, not URLs" (ground rule 3, owner 2026-10-26).
 *
 * Sites on Consent Mode v2 keep sending Google tag requests after "reject",
 * marked with a `gcs` parameter: `G1` then one digit for ad_storage and one
 * for analytics_storage, 1 granted, 0 denied. `G100` means both denied (a
 * "cookieless ping"). On Google tag hosts only, the capture asks this module
 * whether a request carried `G100` and keeps the yes/no answer. The code is a
 * protocol flag, not a value about the visitor, and even so it is never
 * stored: nothing else of the URL is read, and nothing of it leaves here.
 */

/** Hosts whose requests carry Consent Mode codes. Any subdomain matches. */
export const CONSENT_MODE_HOSTS: readonly string[] = [
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'google.com',
];

const DENIED = /^G100$/;

/**
 * True when the request is to a Consent Mode host and says both ad and analytics storage were denied.
 * `hosts` is replaced in tests, where the fake vendors stand in for Google.
 */
export function consentModeDenied(url: URL, hosts: readonly string[] = CONSENT_MODE_HOSTS): boolean {
  const host = url.hostname.toLowerCase();
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  return DENIED.test(url.searchParams.get('gcs') ?? '');
}
