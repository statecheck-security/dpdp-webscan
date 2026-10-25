// WS-5b: the information-only items, from hand-built contexts.
import { describe, expect, it } from 'vitest';
import { buildInfo } from '../../src/checks/info.js';
import { banner, button, context, PAGE, request, snapshot } from './context.js';

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

  it('says no banner was seen, lists third parties before any click, and the languages', () => {
    const ctx = context({
      allPages: snapshot({
        label: 'all-pages',
        requests: [request('www.example.in'), request('fonts.gstatic.com'), request('www.google-analytics.com')],
      }),
      texts: new Map([[PAGE, text('Home', ['en', 'hi'])]]),
    });
    const [bannerInfo, parties, langs] = buildInfo(ctx);
    expect(bannerInfo).toEqual({ id: 'banner', evidence: { bannerFound: false } });
    expect(parties?.evidence.thirdParties?.map((t) => [t.host, t.category])).toEqual([
      ['fonts.gstatic.com', 'other'],
      ['www.google-analytics.com', 'analytics'],
    ]);
    expect(langs).toEqual({ id: 'notice-languages', evidence: { pageLang: ['en', 'hi'] } });
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
});
