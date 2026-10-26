// WS-3e: the orchestrator end to end, on local fixtures only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { killBrowser, launchBrowser } from '../src/browser.js';
import type { CaptureSnapshot } from '../src/capture.js';
import { CMP_FRAMES } from '../src/data/cmps.js';
import { TargetError } from '../src/guard.js';
import { silentLog } from '../src/log.js';
import { RedactionError } from '../src/result.js';
import { collectScan, runScan } from '../src/scan.js';
import type { PageInspectors, ScanOptions } from '../src/scan.js';
import { ENGINE_VERSION } from '../src/types.js';
import { clickAccept, clickReject } from '../src/banner.js';
import { extractText } from '../src/text.js';
import { fixtureScanOptions, serveFixtureHttp, SITE } from './fixtures.js';

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await killBrowser(browser, silentLog);
});

const target = new URL(SITE);

function scanOf(fixture: string, extra: Partial<ScanOptions> = {}) {
  return fixtureScanOptions(fixture, browser, extra);
}

function hosts(snapshot: CaptureSnapshot | undefined): string[] {
  return [...new Set(snapshot?.requests.map((r) => r.host) ?? [])].sort();
}

/** Finding ids outside W12–W16: a fixture without policy pages is about the other checks (WS-5a). */
const TEXT_IDS = new Set(['W12', 'W13', 'W14', 'W15', 'W16']);
function ids(result: { findings: { id: string }[] }): string[] {
  return result.findings.map((f) => f.id).filter((id) => !TEXT_IDS.has(id));
}

describe('runScan', () => {
  it('scans fixtures/clean: 5 pages, nothing third party, no findings, not partial', async () => {
    const { options, routing } = scanOf('clean');
    const result = await runScan(target, options);
    expect(result).toMatchObject({
      engineVersion: ENGINE_VERSION,
      target: SITE,
      partial: false,
      partialReasons: [],
      findings: [],
    });
    expect(result.pages).toEqual([
      { url: SITE, reason: 'requested', status: 'loaded', httpStatus: 200 },
      { url: 'https://site.fixture.in/privacy', reason: 'privacy', status: 'loaded', httpStatus: 200 },
      { url: 'https://site.fixture.in/cookies', reason: 'cookies', status: 'loaded', httpStatus: 200 },
      { url: 'https://site.fixture.in/contact', reason: 'contact', status: 'loaded', httpStatus: 200 },
      { url: 'https://site.fixture.in/grievance', reason: 'grievance', status: 'loaded', httpStatus: 200 },
    ]);
    expect(Date.parse(result.finishedAt)).toBeGreaterThanOrEqual(Date.parse(result.startedAt));
    expect(routing.unrouted).toEqual([]);
  });

  it('refuses a target the guard rejects before opening anything', async () => {
    const { options } = scanOf('clean');
    await expect(runScan(new URL('http://localhost/'), options)).rejects.toBeInstanceOf(TargetError);
  });
});

describe('collectScan', () => {
  it('records only first-party requests on fixtures/clean', async () => {
    const { options } = scanOf('clean');
    const collection = await collectScan(target, options);
    expect(hosts(collection.baseline)).toEqual(['site.fixture.in']);
  });

  it('reports a navigation redirected to a private address as blocked-ssrf, and stops', async () => {
    const { options } = scanOf('redirect-to-private');
    const collection = await collectScan(target, options);
    expect(collection.pages).toEqual([{ url: SITE, reason: 'requested', status: 'blocked-ssrf' }]);
    expect(collection.partialReasons).toEqual(['ssrf-blocked']);
  });

  it('keeps subresources the guard refused out of the snapshot, without marking the scan partial', async () => {
    const { options } = scanOf('subresource-to-private');
    const collection = await collectScan(target, options);
    expect(hosts(collection.baseline)).toEqual(['site.fixture.in', 'tracker-fixture.in']);
    expect(collection.partialReasons).toEqual([]);
  });

  it('stops at a bot wall and says so', async () => {
    const { options } = scanOf('bot-wall');
    const collection = await collectScan(target, options);
    expect(collection.pages).toEqual([{ url: SITE, reason: 'requested', status: 'blocked-bot-wall', httpStatus: 403 }]);
    expect(collection.partialReasons).toEqual(['bot-wall']);
  });

  it('honours robots.txt for extra pages, which is not a partial scan', async () => {
    const { options } = scanOf('robots-disallow');
    const collection = await collectScan(target, options);
    expect(collection.pages.map((p) => [p.reason, p.status])).toEqual([
      ['requested', 'loaded'],
      ['privacy', 'loaded'],
      ['contact', 'skipped-robots'],
    ]);
    expect(collection.partialReasons).toEqual([]);
  });

  it("records nothing from the robots.txt fetch page, even when it serves the site's app", async () => {
    const { options } = scanOf('robots-serves-app');
    const collection = await collectScan(target, options);
    expect(collection.pages.map((p) => [p.reason, p.status])).toEqual([
      ['requested', 'loaded'],
      ['privacy', 'loaded'],
    ]);
    expect(collection.allPages?.requests.map((r) => `${r.host} ${r.pageUrl}`).sort()).toEqual([
      'site.fixture.in https://site.fixture.in/',
      'site.fixture.in https://site.fixture.in/privacy',
    ]);
  });

  it('visits no extra page when robots.txt is unreachable', async () => {
    const { options } = scanOf('clean', { fetchRobots: () => Promise.resolve({ status: 'unreachable' }) });
    const collection = await collectScan(target, options);
    expect(collection.pages.map((p) => p.status)).toEqual([
      'loaded',
      'skipped-robots',
      'skipped-robots',
      'skipped-robots',
      'skipped-robots',
    ]);
  });

  it('runs reject and accept in fresh contexts and records only what fired after each click', async () => {
    // Stands in for WS-4b: finds and clicks the fixture's banner buttons.
    const fakeBanner: Partial<PageInspectors> = {
      findBanner: async (page) =>
        (await page.locator('#consent-banner').isVisible()) ? { text: '', buttons: [] } : undefined,
      clickReject: async (page) => {
        await page.click('#consent-banner #reject', { timeout: 2_000 });
        return { clicked: true, clicks: 1 };
      },
      clickAccept: async (page) => {
        await page.click('#consent-banner #accept', { timeout: 2_000 });
        return { clicked: true, clicks: 1 };
      },
    };
    const { options, routing } = scanOf('reject-ignored', { inspectors: fakeBanner });
    const collection = await collectScan(target, options);

    expect(collection.banner).toBeDefined();
    expect(hosts(collection.baseline)).toEqual(['site.fixture.in']);
    expect(collection.baseline.cookies).toEqual([]);

    expect(collection.afterReject?.requests).toEqual([
      {
        host: 'tracker-fixture.in',
        pageUrl: SITE,
        resourceType: 'image',
        isThirdParty: true,
        count: 1,
      },
    ]);
    expect(collection.afterReject?.cookies.map((c) => [c.name, c.setSinceMark])).toEqual([['trk_after_reject', true]]);
    // A fresh context: the reject run's cookie is not there.
    expect(collection.afterAccept?.cookies.map((c) => c.name)).toEqual(['consent']);
    expect(collection.partialReasons).toEqual([]);
    expect(routing.unrouted).toEqual([]);
  });

  it('marks a banner it cannot click again as banner-not-found', async () => {
    const { options } = scanOf('reject-ignored', {
      inspectors: {
        findBanner: () => Promise.resolve({ text: '', buttons: [] }),
        clickReject: () => Promise.resolve({ clicked: false, reason: 'failed' }),
        clickAccept: () => Promise.resolve({ clicked: false, reason: 'failed' }),
      },
    });
    const collection = await collectScan(target, options);
    expect(collection.afterReject).toBeUndefined();
    expect(collection.partialReasons).toEqual(['banner-not-found']);
  });

  it('stops loading pages when the scan budget runs out, and keeps what it has', async () => {
    const { options } = scanOf('slow-pages', { scanTimeoutMs: 5_000 });
    const started = Date.now();
    const collection = await collectScan(target, options);
    expect(Date.now() - started).toBeLessThan(6_500);
    expect(collection.pages.map((p) => [p.reason, p.status])).toEqual([
      ['requested', 'loaded'],
      ['privacy', 'loaded'],
    ]);
    expect(collection.partialReasons).toEqual(['scan-timeout']);
  });

  it('finishes a meta-refresh loop within the scan budget', async () => {
    const { options } = scanOf('meta-refresh-loop', { scanTimeoutMs: 8_000 });
    const started = Date.now();
    const result = await runScan(target, options);
    expect(Date.now() - started).toBeLessThan(9_500);
    expect(result.pages[0]?.reason).toBe('requested');
  });
});

// WS-4a: the capture feeds W1 and W2 on a real page load.
describe('checks on fixtures', () => {
  it('reports W1 and W2 on trackers-before-consent, with names and hosts but no values', async () => {
    const { options } = scanOf('trackers-before-consent');
    const result = await runScan(target, options);
    expect(ids(result)).toEqual(['W1', 'W2']);
    const [w1, w2] = result.findings;
    expect(w1?.evidence.thirdParties?.map((t) => [t.host, t.vendor, t.category])).toEqual([
      ['tracker-fixture.in', 'Tracker Fixture', 'analytics'],
    ]);
    expect(w2?.evidence.identifiers?.map((i) => `${i.store} ${i.domain} ${i.name}`)).toEqual(
      expect.arrayContaining([
        'cookie site.fixture.in site_session',
        'cookie site.fixture.in _tid',
        'cookie tracker-fixture.in tp_id',
        'localStorage site.fixture.in site_pref',
        'sessionStorage site.fixture.in site_tab',
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('SECRET-VALUE-DO-NOT-RECORD');
  });
});

// WS-4b: the real banner inspectors on fixtures, reject and accept runs included.
describe('banner checks on fixtures', () => {
  it('finds nothing on clean, with its banner clicked both ways', async () => {
    const { options } = scanOf('clean');
    const collection = await collectScan(target, options);
    expect(collection.banner?.buttons.map((b) => b.role)).toEqual(['reject', 'accept']);
    expect(collection.afterReject).toBeDefined();
    expect(collection.afterAccept).toBeDefined();
    expect(collection.rejectClicks).toBe(1);
    expect(collection.persistentControlFoundOn).toContain(SITE);
    expect(collection.partialReasons).toEqual([]);
  });

  it('reports W3 when reject still fires a tracker and sets a cookie', async () => {
    const result = await runScan(target, scanOf('reject-ignored').options);
    expect(ids(result)).toEqual(['W3', 'W7']);
    expect(result.findings[0]?.evidence).toEqual({
      thirdParties: [
        { host: 'tracker-fixture.in', vendor: 'Tracker Fixture', category: 'analytics', pageUrl: SITE, count: 1 },
      ],
      identifiers: [
        {
          name: 'trk_after_reject',
          domain: 'site.fixture.in',
          store: 'cookie',
          firstParty: true,
          expiresInSeconds: expect.any(Number) as number,
        },
      ],
    });
    expect(result.partial).toBe(false);
  });

  // WS-11h: the same tracker after either choice, and what each choice set.
  it('compares what accept and reject each added', async () => {
    const result = await runScan(target, scanOf('reject-ignored').options);
    const comparison = result.info.find((i) => i.id === 'consent-comparison')?.evidence.consentComparison;
    expect(comparison?.afterAccept.thirdParties.map((t) => t.host)).toEqual(['tracker-fixture.in']);
    expect(comparison?.afterReject.thirdParties.map((t) => t.host)).toEqual(['tracker-fixture.in']);
    expect(comparison?.afterReject.identifiers.map((i) => i.name)).toEqual(['trk_after_reject']);
    expect(comparison?.afterAccept.identifiers.map((i) => i.name)).not.toContain('trk_after_reject');
  });

  it('reports W4 with the extra click when reject sits behind cookie settings', async () => {
    const { options } = scanOf('no-first-layer-reject');
    const result = await runScan(target, options);
    expect(ids(result)).toEqual(['W4']);
    expect(result.findings[0]?.evidence).toEqual({ clicksToReject: 2, bannerVendor: 'OneTrust' });
    expect(result.partial).toBe(false);
  });

  it('reports W5 with the quoted sentence, plus W4 and W7, and is not partial without a reject control', async () => {
    const result = await runScan(target, scanOf('continue-means-consent').options);
    expect(ids(result)).toEqual(['W4', 'W5', 'W7']);
    expect(result.findings.find((f) => f.id === 'W5')?.evidence).toEqual({
      quote: 'By continuing to browse this site, you agree to our use of cookies.',
    });
    expect(result.partialReasons).toEqual([]);
  });

  // WS-11b: the reject run must not leave the banner to find a reject somewhere else.
  it.each(['banner-more-info-link', 'banner-settings-navigates'])(
    'reports W4 with no clicks to reject on %s, not partial',
    async (fixture) => {
      const result = await runScan(target, scanOf(fixture).options);
      expect(ids(result)).toEqual(['W4']);
      expect(result.findings[0]?.evidence).toEqual({});
      expect(result.partial).toBe(false);
    },
  );

  it('finds a banner drawn after the page settled, given the wait', async () => {
    const late = await runScan(target, scanOf('banner-late', { bannerWaitMs: 3_000 }).options);
    expect(ids(late)).toEqual(['W3']);
    expect(late.info.find((i) => i.id === 'banner')?.evidence.bannerFound).toBe(true);
    // Without the wait it reads as no banner, so W3 cannot be checked (the v0 behaviour).
    const once = await runScan(target, scanOf('banner-late').options);
    expect(ids(once)).toEqual([]);
    expect(once.info.find((i) => i.id === 'banner')?.evidence.bannerFound).toBe(false);
  });

  // WS-11c: banners drawn in a consent frame are found and clicked there; other frames are never entered.
  it('finds a banner in an allowed consent frame and clicks reject inside it', async () => {
    const result = await runScan(target, scanOf('banner-iframe').options);
    expect(ids(result)).toEqual(['W3']);
    expect(result.findings[0]?.evidence.thirdParties?.map((t) => t.host)).toEqual(['tracker-fixture.in']);
    expect(result.info.find((i) => i.id === 'banner')?.evidence).toMatchObject({
      bannerFound: true,
      bannerVendor: 'CMP Fixture',
    });
    expect(result.partial).toBe(false);
  });

  it('does not enter a frame whose domain is not on the CMP frame list', async () => {
    const unknown = await runScan(target, scanOf('banner-iframe-unknown').options);
    expect(ids(unknown)).toEqual([]);
    expect(unknown.info.find((i) => i.id === 'banner')?.evidence.bannerFound).toBe(false);
    // The same consent frame as above, with only the production list: not searched.
    const production = await runScan(target, scanOf('banner-iframe', { cmpFrames: CMP_FRAMES }).options);
    expect(ids(production)).toEqual([]);
    expect(production.info.find((i) => i.id === 'banner')?.evidence.bannerFound).toBe(false);
  });

  it('reports only W7 when nothing offers a later change of mind', async () => {
    const result = await runScan(target, scanOf('no-settings-link').options);
    expect(ids(result)).toEqual(['W7']);
    expect(result.findings[0]?.evidence.pagesSearched?.[0]).toBe(SITE);
  });
});

// WS-4c: the real form inspector on fixtures. Forms are read, never submitted.
describe('form checks on fixtures', () => {
  it('reads the contact form on clean and finds nothing wrong with it', async () => {
    const collection = await collectScan(target, scanOf('clean').options);
    expect(collection.forms.map((f) => [f.pageUrl, f.method, f.fields.map((x) => x.name)])).toEqual([
      ['https://site.fixture.in/contact', 'post', ['full_name', 'email', 'updates']],
    ]);
    expect(collection.allPages?.label).toBe('all-pages');
  });

  it('reports W6 for a ticked marketing box, and never records the field value', async () => {
    const result = await runScan(target, scanOf('prechecked-box').options);
    expect(ids(result)).toEqual(['W6']);
    expect(result.findings[0]?.evidence.forms?.[0]?.fields).toEqual([
      { type: 'email', name: 'email' },
      { type: 'checkbox', name: 'marketing_optin' },
      { type: 'checkbox', name: 'remember' },
    ]);
    expect(JSON.stringify(result)).not.toContain('SECRET-VALUE-DO-NOT-RECORD');
  });

  it('reports W8 when an extra page loads session replay next to a personal form', async () => {
    const { options, routing } = scanOf('session-replay-form');
    const result = await runScan(target, options);
    expect(ids(result)).toEqual(['W8']);
    expect(result.findings[0]?.evidence.thirdParties?.map((t) => [t.host, t.pageUrl])).toEqual([
      ['replay-fixture.in', 'https://site.fixture.in/contact'],
    ]);
    expect(routing.unrouted).toEqual([]);
  });

  it('reports W8 for replay that loads only after accept (WS-11d)', async () => {
    const { options, routing } = scanOf('replay-after-accept');
    const result = await runScan(target, options);
    expect(ids(result)).toEqual(['W8']);
    expect(result.findings[0]?.evidence.thirdParties?.map((t) => [t.host, t.pageUrl])).toEqual([
      ['replay-fixture.in', SITE],
    ]);
    expect(result.findings[0]?.evidence.forms?.[0]?.pageUrl).toBe(SITE);
    expect(routing.unrouted).toEqual([]);
  });

  it('reports W9 for a form posting to another company, not for the payment form', async () => {
    const result = await runScan(target, scanOf('third-party-form').options);
    expect(ids(result)).toEqual(['W9']);
    expect(result.findings[0]?.evidence.forms?.[0]?.actionHost).toBe('forms-fixture.in');
  });

  it('reports W10 for a personal form on a plain-http page', async () => {
    const result = await runScan(new URL('http://site.fixture.in/'), scanOf('http-form').options);
    expect(ids(result)).toEqual(['W10']);
    expect(result.findings[0]?.evidence.forms?.[0]).toMatchObject({
      pageUrl: 'http://site.fixture.in/',
      actionScheme: 'http',
    });
  });

  it('reports W11 for an email sent by GET, not for the search box or the script form', async () => {
    const result = await runScan(target, scanOf('get-form-email').options);
    expect(ids(result)).toEqual(['W11']);
    expect(result.findings[0]?.evidence.forms?.[0]).toMatchObject({
      method: 'get',
      fields: [{ type: 'email', name: 'email' }],
    });
    expect(result.findings[0]?.evidence.forms?.[0]).not.toHaveProperty('referrerPolicy');
  });

  // WS-11g: every offending form, and the facts for the Referer note.
  it('lists both GET forms with the meta referrer policy and the tracker on their page', async () => {
    const result = await runScan(target, scanOf('get-form-unsafe-referrer').options);
    expect(ids(result)).toEqual(['W1', 'W11']);
    const w11 = result.findings.find((f) => f.id === 'W11')?.evidence;
    expect(w11?.forms?.map((f) => [f.pageUrl, f.referrerPolicy, f.fields.map((x) => x.name)])).toEqual([
      [SITE, 'unsafe-url', ['email']],
      [SITE, 'unsafe-url', ['contact_email', 'phone']],
    ]);
    expect(w11?.thirdParties?.map((t) => t.host)).toEqual(['tracker-fixture.in']);
  });

  it('reads the referrer policy from the response header', async () => {
    const result = await runScan(target, scanOf('get-form-referrer-header').options);
    expect(ids(result)).toEqual(['W11']);
    expect(result.findings[0]?.evidence.forms?.[0]?.referrerPolicy).toBe('no-referrer-when-downgrade');
  });
});

// WS-5a: published text on fixtures. Text is matched in the context and never reaches the result.
describe('text checks on fixtures', () => {
  const textIds = (result: { findings: { id: string }[] }) =>
    result.findings.map((f) => f.id).filter((id) => TEXT_IDS.has(id));

  it('finds every published item on policy-complete', async () => {
    const result = await runScan(target, scanOf('policy-complete').options);
    expect(textIds(result)).toEqual([]);
  });

  it('reports W12–W16 when the pages publish none of them, naming the pages searched', async () => {
    const result = await runScan(target, scanOf('policy-missing-items').options);
    expect(textIds(result)).toEqual(['W12', 'W13', 'W14', 'W15', 'W16']);
    const searched = [
      SITE,
      'https://site.fixture.in/privacy',
      'https://site.fixture.in/contact',
      'https://site.fixture.in/terms',
    ];
    for (const f of result.findings) expect(f.evidence).toEqual({ pagesSearched: searched });
  });

  it('reports W14 with a quote when the longest grievance period is over 90 days', async () => {
    const result = await runScan(target, scanOf('policy-120-days').options);
    expect(textIds(result)).toEqual(['W14']);
    expect(result.findings[0]?.evidence).toEqual({
      pagesSearched: [SITE, 'https://site.fixture.in/privacy', 'https://site.fixture.in/grievance'],
      quote: 'We acknowledge every grievance within 2 days and resolve it within one hundred and twenty (120) days.',
      foundOn: 'https://site.fixture.in/grievance',
    });
  });

  it('keeps page text out of the result', async () => {
    const result = await runScan(target, scanOf('trackers-before-consent').options);
    expect(JSON.stringify(result)).not.toContain('An ordinary page that tracks');
  });
});

// WS-5b: the assembled result on fixtures. runScan asserts redaction on every result, so every scan above
// already passes assertRedacted; these two pin the shape and the refusal.
describe('result on fixtures', () => {
  it('matches the reviewed snapshot for clean, timestamps normalised', async () => {
    const result = await runScan(target, scanOf('clean').options);
    expect({ ...result, startedAt: '<time>', finishedAt: '<time>' }).toMatchSnapshot();
  });

  it('refuses to return a result holding an email address', async () => {
    await expect(runScan(target, scanOf('storage-key-email').options)).rejects.toMatchObject({
      name: 'RedactionError',
      code: 'email',
    });
    await expect(runScan(target, scanOf('storage-key-email').options)).rejects.toBeInstanceOf(RedactionError);
  });
});

// WS-3g: free page slots go to a likely form page, then other links.
describe('page slots on fixtures', () => {
  it('visits the form page and another link after the one policy page, and finds the GET form there', async () => {
    const result = await runScan(target, scanOf('form-page-slot').options);
    expect(result.pages.map((p) => [p.url, p.reason, p.status])).toEqual([
      [SITE, 'requested', 'loaded'],
      ['https://site.fixture.in/privacy', 'privacy', 'loaded'],
      ['https://site.fixture.in/assessment', 'form', 'loaded'],
      ['https://site.fixture.in/about', 'other', 'loaded'],
    ]);
    expect(ids(result)).toEqual(['W11']);
    expect(result.findings[0]?.evidence.forms?.[0]?.pageUrl).toBe('https://site.fixture.in/assessment');
  });
});

// Review fixes (2026-10-25): landing site, recorded URLs, step order.
describe('review fixes on fixtures', () => {
  it('follows the site a requested URL redirects to on another domain', async () => {
    const server = await serveFixtureHttp('redirect-other-domain');
    try {
      const { options, routing } = scanOf('redirect-other-domain');
      options.contextOptions = { install: routing.install, dial: server.dial };
      const result = await runScan(new URL('http://site.fixture.in/'), options);
      expect(result.pages.map((p) => [p.url, p.reason, p.status])).toEqual([
        ['http://site.fixture.in/', 'requested', 'loaded'],
        ['http://www.moved-fixture.in/privacy', 'privacy', 'loaded'],
      ]);
      // The landing site's session cookie is first party there, so it is a site cookie and not W2.
      expect(result.findings.map((f) => f.id)).not.toContain('W2');
      expect(result.info.find((i) => i.id === 'site-cookies')?.evidence.identifiers).toEqual([
        { name: 'PHPSESSID', domain: 'www.moved-fixture.in', store: 'cookie', firstParty: true },
      ]);
      expect(result.findings.map((f) => f.id)).not.toContain('W12');
      expect(JSON.stringify(result)).not.toContain('SECRET-VALUE-DO-NOT-RECORD');
      expect(routing.unrouted).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('records a requested URL without its query string, so a click id cannot fail the result', async () => {
    const result = await runScan(new URL(`${SITE}?gclid=Cj0KCQjwAAAAAAAAAAAAAAAA`), scanOf('clean').options);
    expect(result.target).toBe(SITE);
    expect(result.pages[0]?.url).toBe(SITE);
    expect(result.findings).toEqual([]);
  });

  it('visits the extra pages before the accept run, so the policy pages get the budget first', async () => {
    const steps: string[] = [];
    const { options } = scanOf('clean', {
      inspectors: {
        extractText: async (page) => {
          steps.push(`text ${new URL(page.url()).pathname}`);
          return extractText(page);
        },
        clickReject: async (page, found) => {
          steps.push('reject');
          return clickReject(page, found);
        },
        clickAccept: async (page, found) => {
          steps.push('accept');
          return clickAccept(page, found);
        },
      },
    });
    const collection = await collectScan(target, options);
    expect(steps).toEqual([
      'text /',
      'reject',
      'text /privacy',
      'text /cookies',
      'text /contact',
      'text /grievance',
      'accept',
    ]);
    expect(collection.afterAccept).toBeDefined();
  });
});
