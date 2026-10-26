// WS-4a: the hand-kept tracker list.
import { describe, expect, it } from 'vitest';
import { categorise, isTracking, TRACKERS } from '../src/data/trackers.js';

describe('categorise', () => {
  it.each([
    ['www.google-analytics.com', 'Google Analytics', 'analytics'],
    ['region1.google-analytics.com', 'Google Analytics', 'analytics'],
    ['www.googletagmanager.com', 'Google Tag Manager', 'tag-manager'],
    ['googleads.g.doubleclick.net', 'Google Ads (DoubleClick)', 'ads'],
    ['connect.facebook.net', 'Meta Pixel', 'ads'],
    ['www.facebook.com', 'Meta', 'social'],
    ['snap.licdn.com', 'LinkedIn Insight Tag', 'ads'],
    ['static.ads-twitter.com', 'X (Twitter) Pixel', 'ads'],
    ['www.clarity.ms', 'Microsoft Clarity', 'session-replay'],
    ['static.hotjar.com', 'Hotjar', 'session-replay'],
    ['cdn.mxpnl.com', 'Mixpanel', 'analytics'],
    ['wzrkt.com', 'CleverTap', 'analytics'],
    ['www.youtube.com', 'YouTube', 'social'],
    ['www.youtube-nocookie.com', 'YouTube (privacy-enhanced mode)', 'other'],
    ['cdn.cookielaw.org', 'OneTrust', 'cmp'],
    ['consent.cookiebot.com', 'Cookiebot', 'cmp'],
    ['cdn-cookieyes.com', 'CookieYes', 'cmp'],
    ['geolocation.onetrust.com', 'OneTrust', 'cmp'],
    ['cdn.privacy-mgmt.com', 'Sourcepoint', 'cmp'],
    ['fundingchoicesmessages.google.com', 'Google Funding Choices', 'cmp'],
    ['vendor-list.consensu.org', 'IAB TCF vendor list', 'cmp'],
    ['salesiq.zoho.in', 'Zoho SalesIQ', 'other'],
    ['checkout.razorpay.com', 'Razorpay', 'other'],
    ['o123.ingest.sentry.io', 'Sentry', 'other'],
    ['browser-intake-datadoghq.eu', 'Datadog RUM', 'other'],
    ['WWW.Google-Analytics.COM.', 'Google Analytics', 'analytics'],
  ])('%s → %s (%s)', (host, vendor, category) => {
    expect(categorise(host)).toMatchObject({ vendor, category });
  });

  it('prefers the longest matching suffix', () => {
    expect(categorise('cmp.quantcast.com')?.category).toBe('cmp');
    expect(categorise('pixel.quantserve.com')?.category).toBe('ads');
    expect(categorise('px.ads.linkedin.com')?.category).toBe('ads');
    expect(categorise('platform.linkedin.com')?.category).toBe('social');
  });

  it.each(['www.example.in', 'notgoogle-analytics.com', 'google-analytics.com.evil.in', 'fonts.googleapis.com', 'co'])(
    '%s is not on the list',
    (host) => {
      expect(categorise(host)).toBeUndefined();
    },
  );

  it('flags session replay and payment gateways', () => {
    expect(categorise('edge.fullstory.com')).toEqual({
      vendor: 'FullStory',
      category: 'session-replay',
      sessionReplay: true,
    });
    expect(categorise('js.stripe.com')).toEqual({ vendor: 'Stripe', category: 'other', paymentGateway: true });
    expect(categorise('www.google-analytics.com')).toEqual({ vendor: 'Google Analytics', category: 'analytics' });
  });
});

describe('the list', () => {
  it('has no duplicate patterns', () => {
    const patterns = TRACKERS.map((t) => String(t.pattern));
    expect(patterns.length).toBe(new Set(patterns).size);
  });

  it('marks every session-replay vendor, and only those', () => {
    for (const t of TRACKERS) expect(t.sessionReplay === true, t.vendor).toBe(t.category === 'session-replay');
  });

  it('never counts a CMP, a payment gateway or an unknown host as tracking', () => {
    for (const t of TRACKERS.filter((t) => t.category === 'cmp' || t.paymentGateway)) {
      expect(isTracking(t.category), t.vendor).toBe(false);
    }
    expect(isTracking('other')).toBe(false);
    expect(isTracking(undefined)).toBe(false);
  });

  it('string patterns are lower-case host suffixes', () => {
    for (const t of TRACKERS) {
      if (typeof t.pattern === 'string') expect(t.pattern).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
  });
});
