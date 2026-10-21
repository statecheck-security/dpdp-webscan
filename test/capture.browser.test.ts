// WS-3c: the capture records hosts, cookie names and storage keys, and never a value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { killBrowser, launchBrowser, loadPage, newHardenedContext } from '../src/browser.js';
import type { HardenedContextOptions } from '../src/browser.js';
import { attachCapture } from '../src/capture.js';
import type { CaptureSnapshot } from '../src/capture.js';
import { silentLog } from '../src/log.js';
import type { Logger } from '../src/log.js';
import { registrableDomain } from '../src/pages.js';
import { fixtureContextOptions, SITE } from './fixtures.js';

const SENTINEL = 'SECRET-VALUE-DO-NOT-RECORD';

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await killBrowser(browser, silentLog);
});

async function open(fixture: string, extra: Partial<HardenedContextOptions> = {}) {
  const { options, routing } = fixtureContextOptions(fixture, extra);
  const hardened = await newHardenedContext(browser, options);
  const capture = attachCapture(hardened.context, {
    registrableDomain: registrableDomain(new URL(SITE).hostname),
    blocked: hardened.blocked,
  });
  const page = await hardened.context.newPage();
  return { ...hardened, page, capture, routing };
}

function hosts(snapshot: CaptureSnapshot): string[] {
  return [...new Set(snapshot.requests.map((r) => r.host))].sort();
}

describe('capture on trackers-before-consent', () => {
  it('records hosts, first or third party, with the page they came from and no query string', async () => {
    const { context, page, blocked, capture, routing } = await open('trackers-before-consent');
    expect((await loadPage(page, SITE, { blocked })).status).toBe('loaded');
    const snapshot = await capture.snapshot('baseline');

    expect(hosts(snapshot)).toEqual(['site.fixture.in', 'tracker-fixture.in']);
    expect(snapshot.requests).toContainEqual(
      expect.objectContaining({ host: 'site.fixture.in', resourceType: 'document', isThirdParty: false }),
    );
    expect(snapshot.requests).toContainEqual(
      expect.objectContaining({
        host: 'tracker-fixture.in',
        pageUrl: 'https://site.fixture.in/',
        resourceType: 'image',
        isThirdParty: true,
        count: 1,
      }),
    );
    for (const r of snapshot.requests) expect(r.pageUrl).not.toMatch(/[?#]/);
    expect(snapshot.label).toBe('baseline');
    expect(snapshot.requestsDropped).toBe(0);
    expect(routing.unrouted).toEqual([]);
    await context.close();
  });

  it('records cookie names, domains, party and expiry', async () => {
    const { context, page, blocked, capture } = await open('trackers-before-consent');
    await loadPage(page, SITE, { blocked });
    const { cookies } = await capture.snapshot('baseline');

    const byName = new Map(cookies.map((c) => [c.name, c]));
    expect([...byName.keys()].sort()).toEqual(['_tid', 'site_session', 'tp_id']);
    expect(byName.get('site_session')).toMatchObject({ domain: 'site.fixture.in', firstParty: true });
    expect(byName.get('_tid')).toMatchObject({ domain: 'site.fixture.in', firstParty: true });
    expect(byName.get('tp_id')).toMatchObject({ domain: 'tracker-fixture.in', firstParty: false });
    expect(byName.get('site_session')?.expiresInSeconds).toBeGreaterThan(86_000);
    expect(byName.get('site_session')?.expiresInSeconds).toBeLessThanOrEqual(86_400);
    await context.close();
  });

  it('records storage keys per origin, including a third-party frame', async () => {
    const { context, page, blocked, capture } = await open('trackers-before-consent');
    await loadPage(page, SITE, { blocked });
    const { storage } = await capture.snapshot('baseline');

    expect(storage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: 'https://site.fixture.in',
          store: 'localStorage',
          firstParty: true,
          keys: ['site_pref'],
        }),
        expect.objectContaining({
          origin: 'https://site.fixture.in',
          store: 'sessionStorage',
          firstParty: true,
          keys: ['site_tab'],
        }),
        expect.objectContaining({
          origin: 'https://tracker-fixture.in',
          store: 'localStorage',
          firstParty: false,
          keys: ['trk_uid'],
        }),
      ]),
    );
    expect(storage).toHaveLength(3);
    await context.close();
  });

  it('never records a value: the sentinel is absent from snapshots, marks and logs', async () => {
    const lines: string[] = [];
    const recording: Logger = (event, fields) => lines.push(JSON.stringify({ event, ...fields }));
    const { context, page, blocked, capture } = await open('trackers-before-consent', { log: recording });
    await loadPage(page, SITE, { blocked });
    const mark = await capture.mark();
    const snapshot = await capture.snapshot('baseline');

    // Make sure the page really carried the sentinel, so its absence below means something.
    expect(await page.evaluate(() => document.cookie)).toContain('SECRET-VALUE-DO-NOT-RECORD');
    expect(JSON.stringify(snapshot)).not.toContain(SENTINEL);
    expect(JSON.stringify([...mark.identifiers])).not.toContain(SENTINEL);
    expect(lines.join('\n')).not.toContain(SENTINEL);
    await context.close();
  });

  it('separates what happens after a mark from what came before', async () => {
    const { context, page, blocked, capture } = await open('trackers-before-consent');
    await loadPage(page, SITE, { blocked });
    const mark = await capture.mark();

    // Stands in for a banner click: one more request and new identifiers.
    await Promise.all([
      page.waitForEvent('requestfinished'),
      page.evaluate(() => {
        document.cookie = 'after_click=SECRET-VALUE-DO-NOT-RECORD; path=/';
        localStorage.setItem('after_click_key', 'SECRET-VALUE-DO-NOT-RECORD');
        new Image().src = 'https://tracker-fixture.in/pixel.gif?after=1';
      }),
    ]);
    const after = await capture.snapshot('after-reject', mark);

    expect(after.requests).toEqual([
      {
        host: 'tracker-fixture.in',
        pageUrl: 'https://site.fixture.in/',
        resourceType: 'image',
        isThirdParty: true,
        count: 1,
      },
    ]);
    const newCookies = after.cookies.filter((c) => c.setSinceMark).map((c) => c.name);
    expect(newCookies).toEqual(['after_click']);
    expect(after.cookies.map((c) => c.name)).toContain('site_session');
    const siteLocal = after.storage.find((s) => s.origin === 'https://site.fixture.in' && s.store === 'localStorage');
    expect(siteLocal?.keys.sort()).toEqual(['after_click_key', 'site_pref']);
    expect(siteLocal?.keysSetSinceMark).toEqual(['after_click_key']);
    expect(JSON.stringify(after)).not.toContain(SENTINEL);
    await context.close();
  });
});

describe('capture and the SSRF guard', () => {
  it('never reports a host the guard refused as contacted', async () => {
    const { context, page, blocked, capture } = await open('subresource-to-private');
    await loadPage(page, SITE, { blocked });
    const snapshot = await capture.snapshot('baseline');
    expect(hosts(snapshot)).toEqual(['site.fixture.in', 'tracker-fixture.in']);
    await context.close();
  });

  it('records redirect hops, which never pass through route handlers', async () => {
    const toPublic = await open('redirect-to-private');
    await loadPage(toPublic.page, `${SITE}to-public`, { blocked: toPublic.blocked });
    const snapshot = await toPublic.capture.snapshot('baseline');
    expect(snapshot.requests).toContainEqual(
      expect.objectContaining({
        host: 'tracker-fixture.in',
        pageUrl: 'https://tracker-fixture.in/pixel.gif',
        resourceType: 'document',
        isThirdParty: true,
      }),
    );
    await toPublic.context.close();

    const toPrivate = await open('redirect-to-private');
    await loadPage(toPrivate.page, SITE, { blocked: toPrivate.blocked });
    expect(hosts(await toPrivate.capture.snapshot('baseline'))).toEqual(['site.fixture.in']);
    await toPrivate.context.close();
  });
});
