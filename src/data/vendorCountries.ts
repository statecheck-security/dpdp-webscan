/**
 * Where each vendor in src/data/trackers.ts is based (WS-11f, owner decisions
 * 2026-10-26). Information only: S.16 restricts no country (plan 2.3), so a
 * country never makes a finding; it feeds the "third-party hosts by country"
 * item the report shows.
 *
 * Rule: the country of the company the vendor's own legal, terms, privacy or
 * contact page names as running the service; for a group, the parent or
 * headquarters company (owner). For US-listed parents the business address in
 * SEC EDGAR is used. This is where the company is based, not where a given
 * site's data is stored, and not the regional entity an Indian customer may
 * sign with (noted where a page names one). Not IP geolocation: CDN edges say
 * where the nearest server is, not where the data goes.
 *
 * An entry with no `country` has a `reason`: the pages we could read did not
 * state it. Never fill one in from memory.
 *
 * Checked 2026-10-26. Hand-kept, like the tracker list (decision 9).
 */

export interface VendorCountry {
  /** The company the rule above lands on. */
  company: string;
  /** ISO 3166-1 alpha-2. */
  country?: string;
  /** The page the country comes from. */
  source?: string;
  /** Why there is no country. */
  reason?: string;
  note?: string;
}

const EDGAR = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany';

const GOOGLE: VendorCountry = {
  company: 'Alphabet Inc. (Google LLC)',
  country: 'US',
  source: `${EDGAR}&company=alphabet+inc`,
  note: 'policies.google.com/privacy: "services offered by Google LLC and its affiliates"',
};
const META: VendorCountry = {
  company: 'Meta Platforms, Inc.',
  country: 'US',
  source: `${EDGAR}&company=meta+platforms`,
};
const MICROSOFT: VendorCountry = {
  company: 'Microsoft Corporation',
  country: 'US',
  source: 'https://www.microsoft.com/en-us/privacy/privacystatement',
};
const LINKEDIN: VendorCountry = {
  company: 'LinkedIn Corporation',
  reason: 'Its user agreement names LinkedIn Corporation (California law and courts) but gives no address.',
};
const X: VendorCountry = { company: 'X Corp.', reason: 'Its privacy and company pages could not be read (HTTP 402).' };
const QUANTCAST: VendorCountry = {
  company: 'Quantcast Corporation',
  country: 'US',
  source: 'https://legal.quantcast.com/',
  note: 'Outside the US the contracting party is Quantcast International Limited, Ireland.',
};
const ADOBE: VendorCountry = { company: 'Adobe Inc.', country: 'US', source: `${EDGAR}&company=adobe` };
const CONTENTSQUARE: VendorCountry = {
  company: 'Contentsquare',
  reason: 'Its privacy and legal pages name Contentsquare (which Hotjar and Heap joined) but no entity or country.',
};
const ONETRUST: VendorCountry = {
  company: 'OneTrust',
  reason: 'Its privacy notice, terms and offices pages name no legal entity or headquarters.',
};
const HUBSPOT: VendorCountry = { company: 'HubSpot, Inc.', country: 'US', source: `${EDGAR}&company=hubspot` };
const USERCENTRICS: VendorCountry = {
  company: 'Usercentrics GmbH',
  country: 'DE',
  source: 'https://usercentrics.com/privacy-policy/',
  note: 'The same policy covers Cookiebot as a Usercentrics product.',
};

/** Keyed by `vendor` in TRACKERS; a test requires every vendor to be here. */
export const VENDOR_COUNTRIES: Readonly<Record<string, VendorCountry>> = {
  'Google Analytics': GOOGLE,
  'Google Tag Manager': GOOGLE,
  'Google Ads (DoubleClick)': GOOGLE,
  'Google Ads': GOOGLE,
  'Google AdSense': GOOGLE,
  'Google Funding Choices': GOOGLE,
  YouTube: GOOGLE,
  'YouTube (privacy-enhanced mode)': GOOGLE,

  'Meta Pixel': META,
  Meta: META,
  'LinkedIn Insight Tag': LINKEDIN,
  LinkedIn: LINKEDIN,
  'X (Twitter) Pixel': X,
  'X (Twitter)': X,
  'Pinterest Tag': {
    company: 'Pinterest, Inc.',
    country: 'US',
    source: `${EDGAR}&company=pinterest`,
    note: 'Outside the US its terms are with Pinterest Europe Ltd., Ireland.',
  },
  'TikTok Pixel': { company: 'TikTok', reason: 'Its privacy pages could not be read (TLS error).' },
  'Snap Pixel': {
    company: 'Snap Inc.',
    country: 'US',
    source: 'https://efts.sec.gov/LATEST/search-index?q=%22Snap%20Inc%22&forms=10-K',
    note: 'Outside the US its terms are with Snap Group Limited.',
  },
  'Reddit Pixel': { company: 'Reddit, Inc.', country: 'US', source: `${EDGAR}&CIK=0001713445` },

  'Microsoft Advertising (UET)': MICROSOFT,
  'Microsoft Clarity': MICROSOFT,
  Taboola: {
    company: 'Taboola.com Ltd.',
    country: 'US',
    source: `${EDGAR}&company=taboola`,
    note: 'Business address New York; incorporated in Israel.',
  },
  Outbrain: {
    company: 'Teads Holding Co. (formerly Outbrain Inc.)',
    country: 'US',
    source: 'https://www.outbrain.com/privacy/',
  },
  Criteo: {
    company: 'Criteo',
    country: 'FR',
    source: 'https://www.criteo.com/privacy/',
    note: 'Data Protection Office in Paris; the US site is run by Criteo Corp.',
  },
  'Amazon Ads': { company: 'Amazon.com, Inc.', country: 'US', source: `${EDGAR}&company=amazon+com` },
  AdRoll: {
    company: 'NextRoll, Inc. (formerly AdRoll, Inc.)',
    country: 'US',
    source: 'https://www.nextroll.com/privacy',
  },
  'Quantcast Measure': QUANTCAST,
  'Quantcast Choice': QUANTCAST,
  'Adobe Audience Manager': ADOBE,
  'Adobe Analytics': ADOBE,
  'Adobe Experience Platform Tags': ADOBE,
  AppsFlyer: { company: 'AppsFlyer Ltd.', country: 'IL', source: 'https://www.appsflyer.com/legal/privacy-policy/' },

  Tealium: { company: 'Tealium Inc.', country: 'US', source: 'https://tealium.com/privacy-policy/' },
  Mixpanel: { company: 'Mixpanel, Inc.', country: 'US', source: 'https://mixpanel.com/legal/terms-of-use/' },
  Amplitude: { company: 'Amplitude, Inc.', country: 'US', source: `${EDGAR}&company=amplitude` },
  Segment: {
    company: 'Twilio Inc.',
    country: 'US',
    source: `${EDGAR}&company=twilio`,
    note: "segment.com's privacy page redirects to Twilio's.",
  },
  Heap: CONTENTSQUARE,
  PostHog: { company: 'PostHog', reason: 'Its privacy and terms pages could not be read (rendered by script).' },
  Plausible: { company: 'Plausible Insights OÜ', country: 'EE', source: 'https://plausible.io/privacy' },
  'Matomo Cloud': {
    company: 'InnoCraft Limited',
    country: 'NZ',
    source: 'https://matomo.org/matomo-cloud-privacy-policy/',
  },
  'Yandex Metrica': {
    company: 'YANDEX LLC',
    country: 'RU',
    source: 'https://yandex.com/legal/confidential/',
    note: 'The general Yandex policy; Metrica is not named in it.',
  },
  'Cloudflare Web Analytics': { company: 'Cloudflare, Inc.', country: 'US', source: `${EDGAR}&company=cloudflare` },
  VWO: {
    company: 'Wingify Software Private Limited',
    country: 'IN',
    source: 'https://wingify.com/contact-us/',
    note: 'vwo.com/privacy-policy redirects to Wingify; first-listed office Delhi.',
  },
  HubSpot: HUBSPOT,
  'HubSpot cookie banner': HUBSPOT,
  Branch: { company: 'Branch Metrics, Inc.', country: 'US', source: 'https://legal.branch.io/saas/privacy-policy/' },
  CleverTap: {
    company: 'WizRocket Inc.',
    country: 'US',
    source: 'https://clevertap.com/privacy-policy/',
    note: 'Also names CleverTap Private Limited (India) and CleverTap Pte. Ltd. (Singapore).',
  },
  MoEngage: { company: 'MoEngage Global Inc.', country: 'US', source: 'https://www.moengage.com/privacy-policy/' },
  WebEngage: {
    company: 'Webklipper Technologies Private Limited',
    country: 'IN',
    source: 'https://webengage.com/privacy',
  },
  Netcore: { company: 'Netcore Pvt. Ltd.', country: 'IN', source: 'https://netcore.ai/privacy-policy/' },

  Hotjar: CONTENTSQUARE,
  Contentsquare: CONTENTSQUARE,
  FullStory: { company: 'Fullstory, Inc.', country: 'US', source: 'https://www.fullstory.com/legal/privacy-policy/' },
  LogRocket: { company: 'LogRocket, Inc.', country: 'US', source: 'https://logrocket.com/privacy' },
  Mouseflow: { company: 'Mouseflow ApS', country: 'DK', source: 'https://mouseflow.com/legal/company/privacy-policy/' },
  Smartlook: {
    company: 'Smartlook',
    reason: 'Its privacy page says it joined Cisco and is winding down; no entity or country.',
  },
  'Crazy Egg': { company: 'Crazy Egg, Inc.', country: 'US', source: 'https://www.crazyegg.com/terms' },
  'Lucky Orange': { company: 'Lucky Orange LLC', country: 'US', source: 'https://www.luckyorange.com/legal/privacy' },
  'Quantum Metric': {
    company: 'Quantum Metric, Inc.',
    country: 'US',
    source: 'https://www.quantummetric.com/legal/privacy-policy',
  },
  Inspectlet: { company: 'Inspectlet, Inc.', reason: 'Its privacy and legal pages give no address or country.' },

  OneTrust: ONETRUST,
  'OneTrust (CookiePro)': ONETRUST,
  Cookiebot: USERCENTRICS,
  Usercentrics: USERCENTRICS,
  CookieYes: { company: 'CookieYes Limited', country: 'GB', source: 'https://www.cookieyes.com/privacy-policy/' },
  Osano: { company: 'Osano', reason: 'Its privacy and terms pages name no legal entity or address.' },
  Termly: { company: 'Termly Inc.', country: 'US', source: 'https://termly.io/our-privacy-policy/' },
  iubenda: { company: 'iubenda s.r.l.', country: 'IT', source: 'https://www.iubenda.com/privacy-policy/252372' },
  Didomi: { company: 'Didomi SAS', country: 'FR', source: 'https://www.didomi.io/privacy-policy' },
  TrustArc: {
    company: 'TrustArc Inc.',
    country: 'US',
    source: 'https://trust.trustarc.com/en-US/policies/trustarc-privacy-notice',
  },
  Klaro: { company: 'KIProtect GmbH', country: 'DE', source: 'https://klaro.org/company/imprint' },
  Sourcepoint: {
    company: 'Sourcepoint Technologies, Inc.',
    country: 'US',
    source: 'https://sourcepoint.com/privacy-policy/',
  },
  'IAB TCF vendor list': { company: 'IAB Europe AISBL', country: 'BE', source: 'https://iabeurope.eu/privacy-policy/' },

  Intercom: {
    company: 'Intercom, Inc.',
    country: 'US',
    source: 'https://www.intercom.com/legal/terms-and-policies',
    note: 'Outside the US and Brazil the contracting party is Intercom R&D Unlimited Company, Ireland.',
  },
  Drift: {
    company: 'Salesloft, Inc.',
    country: 'US',
    source: 'https://www.salesloft.com/legal/privacy-notice',
    note: "drift.com's privacy page redirects to Salesloft.",
  },
  Crisp: { company: 'Crisp IM SAS', country: 'FR', source: 'https://crisp.chat/en/privacy/' },
  'Tawk.to': { company: 'tawk.to', country: 'US', source: 'https://www.tawk.to/privacy-policy/' },
  'Zoho SalesIQ': {
    company: 'Zoho Corporation',
    country: 'IN',
    source: 'https://www.zoho.com/contactus.html',
    note: 'The privacy policy is made by the Zoho Group; first-listed office Chennai.',
  },
  Freshchat: { company: 'Freshworks Inc.', country: 'US', source: 'https://www.freshworks.com/privacy/' },

  Razorpay: { company: 'Razorpay Software Limited', country: 'IN', source: 'https://razorpay.com/privacy/' },
  PayU: { company: 'PayU', reason: 'Its privacy page names no operating company or address.' },
  Paytm: { company: 'Paytm', reason: 'Its privacy and about pages name no operating company or address.' },
  Stripe: {
    company: 'Stripe',
    reason: 'Its legal pages name no parent; in India the contracting party is Stripe India Private Ltd.',
  },
  CCAvenue: { company: 'AvenuesAI', reason: 'Its site names AvenuesAI but no address or country.' },
  Instamojo: {
    company: 'Instamojo Research and Development Private Limited',
    country: 'IN',
    source: 'https://www.instamojo.com/privacy/',
  },
  PhonePe: { company: 'PhonePe Limited', country: 'IN', source: 'https://www.phonepe.com/privacy-policy/' },

  Vimeo: { company: 'Vimeo, Inc.', country: 'US', source: `${EDGAR}&company=vimeo` },
  'New Relic': { company: 'New Relic, Inc.', country: 'US', source: `${EDGAR}&company=new+relic` },
  Sentry: { company: 'Functional Software, Inc. (Sentry)', country: 'US', source: 'https://sentry.io/privacy/' },
  'Datadog RUM': { company: 'Datadog, Inc.', country: 'US', source: `${EDGAR}&company=datadog` },
};

/** The country a vendor is based in, or undefined when not known (VENDOR_COUNTRIES has the reason). */
export function vendorCountry(vendor: string): string | undefined {
  return VENDOR_COUNTRIES[vendor]?.country;
}
