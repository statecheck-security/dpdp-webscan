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

// WS-11h: what each banner choice added on the requested page.
describe('consent-comparison', () => {
  const comparison = (ctx: Parameters<typeof buildInfo>[0]) =>
    buildInfo(ctx).find((i) => i.id === 'consent-comparison')?.evidence.consentComparison;
  const run = (label: 'after-accept' | 'after-reject', parts: Parameters<typeof snapshot>[0] = {}) =>
    snapshot({ label, requests: [], ...parts });

  it('is absent unless both choice runs completed', () => {
    expect(comparison(context({ afterReject: run('after-reject') }))).toBeUndefined();
    expect(comparison(context({ afterAccept: run('after-accept') }))).toBeUndefined();
  });

  it('lists empty additions when neither choice loads anything', () => {
    expect(comparison(context({ afterAccept: run('after-accept'), afterReject: run('after-reject') }))).toEqual({
      afterAccept: { thirdParties: [], identifiers: [] },
      afterReject: { thirdParties: [], identifiers: [] },
    });
  });

  it('lists trackers and identifiers each choice added, leaving out what loaded before any choice', () => {
    const baseline = snapshot({
      requests: [request('www.google-analytics.com')],
      cookies: [cookie('_ga', 'example.in', { setSinceMark: false })],
    });
    const afterAccept = run('after-accept', {
      requests: [request('www.google-analytics.com'), request('connect.facebook.net'), request('cdn.cookielaw.org')],
      cookies: [cookie('_ga', 'example.in'), cookie('_fbp', 'example.in'), cookie('OptanonConsent', 'example.in')],
    });
    const afterReject = run('after-reject', {
      requests: [request('www.clarity.ms')],
      storage: [storage('https://www.example.in', ['_clck'])],
    });
    const result = comparison(context({ baseline, afterAccept, afterReject }));
    // Analytics loaded before any choice is W1's, not an addition; the CMP and its consent cookie are not trackers.
    expect(result?.afterAccept.thirdParties.map((t) => t.host)).toEqual(['connect.facebook.net']);
    expect(result?.afterAccept.identifiers.map((i) => i.name)).toEqual(['_fbp']);
    expect(result?.afterReject.thirdParties.map((t) => t.host)).toEqual(['www.clarity.ms']);
    expect(result?.afterReject.identifiers.map((i) => [i.store, i.name])).toEqual([['localStorage', '_clck']]);
  });

  it('carries lists only: no count compared, no ratio', () => {
    const evidence = comparison(context({ afterAccept: run('after-accept'), afterReject: run('after-reject') }));
    expect(Object.keys(evidence ?? {})).toEqual(['afterAccept', 'afterReject']);
    expect(Object.keys(evidence?.afterAccept ?? {})).toEqual(['thirdParties', 'identifiers']);
  });
});
