/**
 * Hand-kept vendor list (WS-4a, plan 2.3 and decision 9): host suffix →
 * vendor and category. Kept by hand until the licence question on the public
 * tracker lists is settled; `categorise` is the only way checks read it, so a
 * generated list can replace TRACKERS without touching them.
 *
 * Categories that count as tracking for W1/W3 are TRACKING_CATEGORIES. CMPs,
 * chat widgets, payment scripts, video hosts without ad cookies and error or
 * performance monitoring are listed so the report can name them, but as `cmp`
 * or `other`, never as trackers. Unknown third parties get no match here;
 * callers treat them as `other`.
 */

import type { TrackerCategory } from '../types.js';

export interface TrackerEntry {
  /** A host suffix (`google-analytics.com` matches it and any subdomain) or a RegExp on the whole host. */
  pattern: string | RegExp;
  vendor: string;
  category: TrackerCategory;
  /** Records sessions or keystrokes (W8). */
  sessionReplay?: true;
  /** Payment gateway: never a W9 finding (plan section 10). */
  paymentGateway?: true;
}

export interface TrackerMatch {
  vendor: string;
  category: TrackerCategory;
  sessionReplay?: true;
  paymentGateway?: true;
}

/** The categories W1 and W3 count. `cmp` and `other` never do. */
export const TRACKING_CATEGORIES: readonly TrackerCategory[] = [
  'analytics',
  'ads',
  'social',
  'session-replay',
  'tag-manager',
];

const replay = { category: 'session-replay', sessionReplay: true } as const;
const payment = { category: 'other', paymentGateway: true } as const;

export const TRACKERS: readonly TrackerEntry[] = [
  // Google
  { pattern: 'google-analytics.com', vendor: 'Google Analytics', category: 'analytics' },
  { pattern: 'analytics.google.com', vendor: 'Google Analytics', category: 'analytics' },
  { pattern: 'googletagmanager.com', vendor: 'Google Tag Manager', category: 'tag-manager' },
  { pattern: 'doubleclick.net', vendor: 'Google Ads (DoubleClick)', category: 'ads' },
  { pattern: 'googleadservices.com', vendor: 'Google Ads', category: 'ads' },
  { pattern: 'googlesyndication.com', vendor: 'Google AdSense', category: 'ads' },
  { pattern: 'adservice.google.com', vendor: 'Google Ads', category: 'ads' },
  { pattern: 'youtube.com', vendor: 'YouTube', category: 'social' },
  { pattern: 'youtube-nocookie.com', vendor: 'YouTube (privacy-enhanced mode)', category: 'other' },
  { pattern: 'ytimg.com', vendor: 'YouTube', category: 'other' },

  // Social networks and their ad pixels
  { pattern: 'connect.facebook.net', vendor: 'Meta Pixel', category: 'ads' },
  { pattern: 'facebook.com', vendor: 'Meta', category: 'social' },
  { pattern: 'snap.licdn.com', vendor: 'LinkedIn Insight Tag', category: 'ads' },
  { pattern: 'px.ads.linkedin.com', vendor: 'LinkedIn Insight Tag', category: 'ads' },
  { pattern: 'platform.linkedin.com', vendor: 'LinkedIn', category: 'social' },
  { pattern: 'ads-twitter.com', vendor: 'X (Twitter) Pixel', category: 'ads' },
  { pattern: 'analytics.twitter.com', vendor: 'X (Twitter) Pixel', category: 'ads' },
  { pattern: 't.co', vendor: 'X (Twitter) Pixel', category: 'ads' },
  { pattern: 'platform.twitter.com', vendor: 'X (Twitter)', category: 'social' },
  { pattern: 'ct.pinterest.com', vendor: 'Pinterest Tag', category: 'ads' },
  { pattern: 'analytics.tiktok.com', vendor: 'TikTok Pixel', category: 'ads' },
  { pattern: 'sc-static.net', vendor: 'Snap Pixel', category: 'ads' },
  { pattern: 'tr.snapchat.com', vendor: 'Snap Pixel', category: 'ads' },
  { pattern: 'redditstatic.com', vendor: 'Reddit Pixel', category: 'ads' },
  { pattern: 'alb.reddit.com', vendor: 'Reddit Pixel', category: 'ads' },

  // Ad networks
  { pattern: 'bat.bing.com', vendor: 'Microsoft Advertising (UET)', category: 'ads' },
  { pattern: 'taboola.com', vendor: 'Taboola', category: 'ads' },
  { pattern: 'outbrain.com', vendor: 'Outbrain', category: 'ads' },
  { pattern: 'criteo.com', vendor: 'Criteo', category: 'ads' },
  { pattern: 'criteo.net', vendor: 'Criteo', category: 'ads' },
  { pattern: 'amazon-adsystem.com', vendor: 'Amazon Ads', category: 'ads' },
  { pattern: 'adroll.com', vendor: 'AdRoll', category: 'ads' },
  { pattern: 'quantserve.com', vendor: 'Quantcast Measure', category: 'ads' },
  { pattern: 'demdex.net', vendor: 'Adobe Audience Manager', category: 'ads' },
  { pattern: 'appsflyer.com', vendor: 'AppsFlyer', category: 'ads' },
  { pattern: 'appsflyersdk.com', vendor: 'AppsFlyer', category: 'ads' },

  // Analytics and marketing automation
  { pattern: 'omtrdc.net', vendor: 'Adobe Analytics', category: 'analytics' },
  { pattern: 'adobedtm.com', vendor: 'Adobe Experience Platform Tags', category: 'tag-manager' },
  { pattern: 'tags.tiqcdn.com', vendor: 'Tealium', category: 'tag-manager' },
  { pattern: 'mixpanel.com', vendor: 'Mixpanel', category: 'analytics' },
  { pattern: 'mxpnl.com', vendor: 'Mixpanel', category: 'analytics' },
  { pattern: 'amplitude.com', vendor: 'Amplitude', category: 'analytics' },
  { pattern: 'segment.com', vendor: 'Segment', category: 'analytics' },
  { pattern: 'segment.io', vendor: 'Segment', category: 'analytics' },
  { pattern: 'heapanalytics.com', vendor: 'Heap', category: 'analytics' },
  { pattern: 'heap.io', vendor: 'Heap', category: 'analytics' },
  { pattern: 'posthog.com', vendor: 'PostHog', category: 'analytics' },
  { pattern: 'plausible.io', vendor: 'Plausible', category: 'analytics' },
  { pattern: 'matomo.cloud', vendor: 'Matomo Cloud', category: 'analytics' },
  { pattern: 'mc.yandex.ru', vendor: 'Yandex Metrica', category: 'analytics' },
  { pattern: 'mc.yandex.com', vendor: 'Yandex Metrica', category: 'analytics' },
  { pattern: 'cloudflareinsights.com', vendor: 'Cloudflare Web Analytics', category: 'analytics' },
  { pattern: 'visualwebsiteoptimizer.com', vendor: 'VWO', category: 'analytics' },
  { pattern: 'hs-scripts.com', vendor: 'HubSpot', category: 'analytics' },
  { pattern: 'hs-analytics.net', vendor: 'HubSpot', category: 'analytics' },
  { pattern: 'track.hubspot.com', vendor: 'HubSpot', category: 'analytics' },
  { pattern: 'branch.io', vendor: 'Branch', category: 'analytics' },
  { pattern: 'clevertap.com', vendor: 'CleverTap', category: 'analytics' },
  { pattern: 'clevertap-prod.com', vendor: 'CleverTap', category: 'analytics' },
  { pattern: 'wzrkt.com', vendor: 'CleverTap', category: 'analytics' },
  { pattern: 'moengage.com', vendor: 'MoEngage', category: 'analytics' },
  { pattern: 'webengage.com', vendor: 'WebEngage', category: 'analytics' },
  { pattern: 'webengage.co', vendor: 'WebEngage', category: 'analytics' },
  { pattern: 'netcoresmartech.com', vendor: 'Netcore', category: 'analytics' },

  // Session replay and heatmaps (W8)
  { pattern: 'clarity.ms', vendor: 'Microsoft Clarity', ...replay },
  { pattern: 'hotjar.com', vendor: 'Hotjar', ...replay },
  { pattern: 'hotjar.io', vendor: 'Hotjar', ...replay },
  { pattern: 'fullstory.com', vendor: 'FullStory', ...replay },
  { pattern: 'logrocket.io', vendor: 'LogRocket', ...replay },
  { pattern: 'logrocket.com', vendor: 'LogRocket', ...replay },
  { pattern: 'lr-ingest.io', vendor: 'LogRocket', ...replay },
  { pattern: 'lr-ingest.com', vendor: 'LogRocket', ...replay },
  { pattern: 'mouseflow.com', vendor: 'Mouseflow', ...replay },
  { pattern: 'smartlook.com', vendor: 'Smartlook', ...replay },
  { pattern: 'smartlook.cloud', vendor: 'Smartlook', ...replay },
  { pattern: 'crazyegg.com', vendor: 'Crazy Egg', ...replay },
  { pattern: 'luckyorange.com', vendor: 'Lucky Orange', ...replay },
  { pattern: 'luckyorange.net', vendor: 'Lucky Orange', ...replay },
  { pattern: 'contentsquare.net', vendor: 'Contentsquare', ...replay },
  { pattern: 'quantummetric.com', vendor: 'Quantum Metric', ...replay },
  { pattern: 'inspectlet.com', vendor: 'Inspectlet', ...replay },

  // Consent management platforms: never trackers
  { pattern: 'cookielaw.org', vendor: 'OneTrust', category: 'cmp' },
  { pattern: 'onetrust.com', vendor: 'OneTrust', category: 'cmp' },
  { pattern: 'cookiepro.com', vendor: 'OneTrust (CookiePro)', category: 'cmp' },
  { pattern: 'cookiebot.com', vendor: 'Cookiebot', category: 'cmp' },
  { pattern: 'cookiebot.eu', vendor: 'Cookiebot', category: 'cmp' },
  { pattern: 'cookieyes.com', vendor: 'CookieYes', category: 'cmp' },
  { pattern: 'cdn-cookieyes.com', vendor: 'CookieYes', category: 'cmp' },
  { pattern: 'osano.com', vendor: 'Osano', category: 'cmp' },
  { pattern: 'termly.io', vendor: 'Termly', category: 'cmp' },
  { pattern: 'iubenda.com', vendor: 'iubenda', category: 'cmp' },
  { pattern: 'cmp.quantcast.com', vendor: 'Quantcast Choice', category: 'cmp' },
  { pattern: 'privacy-center.org', vendor: 'Didomi', category: 'cmp' },
  { pattern: 'didomi.io', vendor: 'Didomi', category: 'cmp' },
  { pattern: 'trustarc.com', vendor: 'TrustArc', category: 'cmp' },
  { pattern: 'truste.com', vendor: 'TrustArc', category: 'cmp' },
  { pattern: 'usercentrics.eu', vendor: 'Usercentrics', category: 'cmp' },
  { pattern: 'usercentrics.com', vendor: 'Usercentrics', category: 'cmp' },
  { pattern: 'kiprotect.com', vendor: 'Klaro', category: 'cmp' },
  { pattern: 'hs-banner.com', vendor: 'HubSpot cookie banner', category: 'cmp' },
  // WS-11d: endpoints a CMP calls after the visitor's choice, which W3 must not read as tracking.
  // OneTrust's geolocation lookup (geolocation.onetrust.com) is already covered by onetrust.com.
  { pattern: 'privacy-mgmt.com', vendor: 'Sourcepoint', category: 'cmp' },
  { pattern: 'fundingchoicesmessages.google.com', vendor: 'Google Funding Choices', category: 'cmp' },
  { pattern: 'consensu.org', vendor: 'IAB TCF vendor list', category: 'cmp' },

  // Chat widgets: named, not counted as trackers
  { pattern: 'intercom.io', vendor: 'Intercom', category: 'other' },
  { pattern: 'intercomcdn.com', vendor: 'Intercom', category: 'other' },
  { pattern: 'drift.com', vendor: 'Drift', category: 'other' },
  { pattern: 'driftt.com', vendor: 'Drift', category: 'other' },
  { pattern: 'crisp.chat', vendor: 'Crisp', category: 'other' },
  { pattern: 'tawk.to', vendor: 'Tawk.to', category: 'other' },
  { pattern: /^salesiq\.zoho(public)?\.(com|in)$/, vendor: 'Zoho SalesIQ', category: 'other' },
  { pattern: 'freshchat.com', vendor: 'Freshchat', category: 'other' },

  // Payment gateways (plan section 10): never W9
  { pattern: 'razorpay.com', vendor: 'Razorpay', ...payment },
  { pattern: 'payu.in', vendor: 'PayU', ...payment },
  { pattern: 'payumoney.com', vendor: 'PayU', ...payment },
  { pattern: 'paytm.in', vendor: 'Paytm', ...payment },
  { pattern: 'paytm.com', vendor: 'Paytm', ...payment },
  { pattern: 'stripe.com', vendor: 'Stripe', ...payment },
  { pattern: 'ccavenue.com', vendor: 'CCAvenue', ...payment },
  { pattern: 'instamojo.com', vendor: 'Instamojo', ...payment },
  { pattern: 'phonepe.com', vendor: 'PhonePe', ...payment },

  // Video, error and performance monitoring: named, not trackers
  { pattern: 'vimeo.com', vendor: 'Vimeo', category: 'other' },
  { pattern: 'vimeocdn.com', vendor: 'Vimeo', category: 'other' },
  { pattern: 'nr-data.net', vendor: 'New Relic', category: 'other' },
  { pattern: 'newrelic.com', vendor: 'New Relic', category: 'other' },
  { pattern: 'sentry.io', vendor: 'Sentry', category: 'other' },
  { pattern: 'sentry-cdn.com', vendor: 'Sentry', category: 'other' },
  { pattern: /^browser-intake-datadoghq\.(com|eu)$/, vendor: 'Datadog RUM', category: 'other' },
  { pattern: 'datadoghq-browser-agent.com', vendor: 'Datadog RUM', category: 'other' },
];

function suffixMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function toMatch(entry: TrackerEntry): TrackerMatch {
  return {
    vendor: entry.vendor,
    category: entry.category,
    ...(entry.sessionReplay ? { sessionReplay: true } : {}),
    ...(entry.paymentGateway ? { paymentGateway: true } : {}),
  };
}

/**
 * The vendor and category of a host, or undefined when the list does not know it.
 * The longest matching suffix wins, so `cmp.quantcast.com` is a CMP while
 * `quantserve.com` is ads; a RegExp entry beats any suffix.
 */
export function categorise(host: string): TrackerMatch | undefined {
  const bare = host.toLowerCase().replace(/\.$/, '');
  let best: { entry: TrackerEntry; length: number } | undefined;
  for (const entry of TRACKERS) {
    if (typeof entry.pattern === 'string') {
      if (!suffixMatches(bare, entry.pattern)) continue;
      if (!best || entry.pattern.length > best.length) best = { entry, length: entry.pattern.length };
    } else if (entry.pattern.test(bare)) {
      return toMatch(entry);
    }
  }
  return best ? toMatch(best.entry) : undefined;
}

export function isTracking(category: TrackerCategory | undefined): boolean {
  return category !== undefined && TRACKING_CATEGORIES.includes(category);
}
