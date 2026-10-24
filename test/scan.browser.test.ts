// WS-3e: the orchestrator end to end, on local fixtures only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { killBrowser, launchBrowser } from '../src/browser.js';
import type { CaptureSnapshot } from '../src/capture.js';
import { TargetError } from '../src/guard.js';
import { silentLog } from '../src/log.js';
import { collectScan, runScan } from '../src/scan.js';
import type { PageInspectors, ScanOptions } from '../src/scan.js';
import { ENGINE_VERSION } from '../src/types.js';
import { fixtureScanOptions, SITE } from './fixtures.js';

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
    expect(result.findings.map((f) => f.id)).toEqual(['W1', 'W2']);
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
  const ids = (result: { findings: { id: string }[] }) => result.findings.map((f) => f.id);

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

  it('reports only W7 when nothing offers a later change of mind', async () => {
    const result = await runScan(target, scanOf('no-settings-link').options);
    expect(ids(result)).toEqual(['W7']);
    expect(result.findings[0]?.evidence.pagesSearched?.[0]).toBe(SITE);
  });
});
