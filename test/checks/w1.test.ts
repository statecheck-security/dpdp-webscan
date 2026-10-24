// W1: third-party trackers before any interaction, from hand-built contexts.
import { describe, expect, it } from 'vitest';
import { detectW1 } from '../../src/checks/w1.js';
import { context, PAGE, request, snapshot } from './context.js';

describe('detectW1', () => {
  it('is quiet with first-party requests only', () => {
    expect(detectW1(context())).toBeUndefined();
  });

  it('reports tracker hosts with vendor, category and request count', () => {
    const baseline = snapshot({
      requests: [
        request('www.example.in', { resourceType: 'document' }),
        request('www.googletagmanager.com'),
        request('www.google-analytics.com', { resourceType: 'script' }),
        request('www.google-analytics.com', { resourceType: 'fetch', count: 3 }),
      ],
    });
    expect(detectW1(context({ baseline }))).toEqual({
      id: 'W1',
      evidence: {
        thirdParties: [
          {
            host: 'www.google-analytics.com',
            vendor: 'Google Analytics',
            category: 'analytics',
            pageUrl: PAGE,
            count: 4,
          },
          {
            host: 'www.googletagmanager.com',
            vendor: 'Google Tag Manager',
            category: 'tag-manager',
            pageUrl: PAGE,
            count: 1,
          },
        ],
      },
    });
  });

  it('does not count CMPs, payment scripts, unknown hosts or first-party subdomains', () => {
    const baseline = snapshot({
      requests: [
        request('cdn.cookielaw.org'),
        request('checkout.razorpay.com'),
        request('fonts.gstatic.com'),
        request('static.example.in'),
      ],
    });
    expect(detectW1(context({ baseline }))).toBeUndefined();
  });

  it('reads the baseline only, not the after-reject or after-accept runs', () => {
    const later = snapshot({ requests: [request('connect.facebook.net')] });
    expect(detectW1(context({ afterReject: { ...later, label: 'after-reject' }, afterAccept: later }))).toBeUndefined();
  });

  it('uses the injected tracker lookup', () => {
    const baseline = snapshot({ requests: [request('cdn.unknown-vendor.in')] });
    const finding = detectW1(context({ baseline, trackers: () => ({ vendor: 'Someone', category: 'ads' }) }));
    expect(finding?.evidence.thirdParties?.map((t) => t.host)).toEqual(['cdn.unknown-vendor.in']);
  });
});
