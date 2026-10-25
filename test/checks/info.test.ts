// WS-5b: the information-only items, from hand-built contexts (site-cookies: WS-2 owner review).
import { describe, expect, it } from 'vitest';
import { buildInfo } from '../../src/checks/info.js';
import { banner, button, context, cookie, PAGE, request, snapshot, storage } from './context.js';

const loaded = (path: string, reason: 'requested' | 'privacy' | 'grievance' = 'privacy') => ({
  url: `${PAGE}${path}`,
  reason,
  status: 'loaded' as const,
  httpStatus: 200,
});
const text = (t: string, langs = ['en']) => ({ text: t, langs, hasMailto: false });

describe('buildInfo', () => {
  it('reports only coverage when the requested page did not load', () => {
    const ctx = context({ pages: [{ url: PAGE, reason: 'requested', status: 'blocked-bot-wall', httpStatus: 403 }] });
    expect(buildInfo(ctx)).toEqual([{ id: 'coverage', evidence: { pagesSearched: [], found: [] } }]);
  });

  it('says no banner was seen, lists non-tracker third parties before any click, and the languages', () => {
    const ctx = context({
      allPages: snapshot({
        label: 'all-pages',
        requests: [
          request('www.example.in'),
          request('fonts.gstatic.com'),
          request('checkout.razorpay.com'),
          request('www.google-analytics.com'),
        ],
      }),
      texts: new Map([[PAGE, text('Home', ['en', 'hi'])]]),
    });
    const [bannerInfo, cookies, parties, langs] = buildInfo(ctx);
    expect(bannerInfo).toEqual({ id: 'banner', evidence: { bannerFound: false } });
    expect(cookies).toEqual({ id: 'site-cookies', evidence: { identifiers: [] } });
    // Trackers are W1's; this item names the rest.
    expect(parties?.evidence.thirdParties?.map((t) => [t.host, t.vendor ?? '', t.category])).toEqual([
      ['checkout.razorpay.com', 'Razorpay', 'other'],
      ['fonts.gstatic.com', '', 'other'],
    ]);
    expect(langs).toEqual({ id: 'notice-languages', evidence: { pageLang: ['en', 'hi'] } });
  });

  it('names the session, security and consent-state cookies W2 leaves out, and only those', () => {
    const baseline = snapshot({
      cookies: [
        cookie('PHPSESSID'),
        cookie('OptanonConsent', 'example.in', { expiresInSeconds: 31_536_000 }),
        cookie('_ga', 'example.in'),
        cookie('__cf_bm', 'cdn.vendor.in'),
      ],
      storage: [storage('https://www.example.in', ['uc_settings', 'cart'])],
    });
    expect(buildInfo(context({ baseline }))[1]).toEqual({
      id: 'site-cookies',
      evidence: {
        identifiers: [
          {
            name: 'OptanonConsent',
            domain: 'example.in',
            store: 'cookie',
            firstParty: true,
            expiresInSeconds: 31_536_000,
          },
          { name: 'PHPSESSID', domain: 'www.example.in', store: 'cookie', firstParty: true },
          { name: 'uc_settings', domain: 'www.example.in', store: 'localStorage', firstParty: true },
        ],
      },
    });
  });

  it("names a Laravel site's <app>_session cookie with its XSRF-TOKEN as site cookies", () => {
    const baseline = snapshot({ cookies: [cookie('XSRF-TOKEN'), cookie('shopname_session')] });
    expect(buildInfo(context({ baseline }))[1]?.evidence.identifiers?.map((i) => i.name)).toEqual([
      'shopname_session',
      'XSRF-TOKEN',
    ]);
  });

  it('names the banner vendor and the first page with a persistent control', () => {
    const ctx = context({
      banner: banner([button('reject'), button('accept')], 'We use cookies.', 'OneTrust'),
      persistentControlFoundOn: [`${PAGE}privacy`, PAGE],
    });
    expect(buildInfo(ctx)[0]).toEqual({
      id: 'banner',
      evidence: { bannerFound: true, bannerVendor: 'OneTrust', foundOn: `${PAGE}privacy` },
    });
  });

  it('records where each published item was found, W14 only when within 90 days', () => {
    const ctx = context({
      pages: [loaded('', 'requested'), loaded('privacy'), loaded('grievance', 'grievance')],
      texts: new Map([
        [PAGE, text('Home')],
        [`${PAGE}privacy`, text('Contact our Grievance Officer.\nYou can complain to the Data Protection Board.')],
        [`${PAGE}grievance`, text('We resolve grievances within 30 days.')],
      ]),
    });
    expect(buildInfo(ctx).at(-1)).toEqual({
      id: 'coverage',
      evidence: {
        pagesSearched: [PAGE, `${PAGE}privacy`, `${PAGE}grievance`],
        found: [
          { id: 'W12', pageUrl: `${PAGE}privacy` },
          { id: 'W14', pageUrl: `${PAGE}grievance` },
          { id: 'W15', pageUrl: `${PAGE}privacy` },
        ],
      },
    });
  });

  it('does not count a period above 90 days as found', () => {
    const ctx = context({ texts: new Map([[PAGE, text('We resolve grievances within 120 days.')]]) });
    expect(buildInfo(ctx).at(-1)?.evidence.found).toEqual([]);
  });

  it('counts W14 as found from the response period, not a longer record-keeping one', () => {
    const ctx = context({
      texts: new Map([
        [PAGE, text('We resolve complaints within 30 days. Complaint records are kept for up to 6 months.')],
      ]),
    });
    expect(buildInfo(ctx).at(-1)?.evidence.found).toEqual([{ id: 'W14', pageUrl: PAGE }]);
  });
});
