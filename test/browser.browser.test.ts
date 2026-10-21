// WS-3b: hardened context, route guard and egress proxy, against local fixtures only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { killBrowser, launchBrowser, loadPage, newHardenedContext, UA_SUFFIX } from '../src/browser.js';
import type { HardenedContextOptions } from '../src/browser.js';
import { silentLog } from '../src/log.js';
import { fixtureContextOptions, noNetworkDial, serveFixtureHttp, SITE } from './fixtures.js';

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
  const page = await hardened.context.newPage();
  return { ...hardened, page, routing };
}

describe('route guard', () => {
  it('aborts subresources to hosts that resolve to private addresses, and lets public ones through', async () => {
    const { context, page, blocked, routing } = await open('subresource-to-private');
    const fetched: string[] = [];
    page.on('requestfinished', (r) => fetched.push(new URL(r.url()).hostname));

    expect((await loadPage(page, SITE, { blocked })).status).toBe('loaded');
    expect(blocked.map((b) => b.host).sort()).toEqual(['metadata.fixture.in', 'private.fixture.in']);
    expect(fetched).toContain('tracker-fixture.in');
    expect(fetched).not.toContain('private.fixture.in');
    expect(routing.unrouted).toEqual([]);
    await context.close();
  });

  it('stops hosts the resolver does not know before anything is fetched', async () => {
    const { context, page, blocked, routing } = await open('download');
    await loadPage(page, SITE, { blocked });
    const result = await page.evaluate(() =>
      fetch('https://statechecksecurity.com/').then(
        () => 'fetched',
        () => 'failed',
      ),
    );
    expect(result).toBe('failed');
    expect(blocked.map((b) => b.host)).toContain('statechecksecurity.com');
    expect(routing.unrouted).toEqual([]);
    await context.close();
  });
});

describe('egress proxy (redirect hops never pass through route handlers)', () => {
  it.each([
    ['', 'private.fixture.in'],
    ['to-loopback', '127.0.0.1'],
    ['to-metadata', '169.254.169.254'],
  ])('blocks a navigation redirected to a private address (/%s)', async (path, host) => {
    const attempts: string[] = [];
    const { context, page, blocked } = await open('redirect-to-private', { dial: noNetworkDial(attempts) });
    expect((await loadPage(page, `${SITE}${path}`, { blocked })).status).toBe('blocked');
    expect(blocked).toContainEqual({ host, reason: 'ssrf' });
    expect(attempts).toEqual([]);
    await context.close();
  });

  it('dials only the validated address for a redirect to a public host', async () => {
    const attempts: string[] = [];
    const { context, page, blocked } = await open('redirect-to-private', { dial: noNetworkDial(attempts) });
    expect((await loadPage(page, `${SITE}to-public`, { blocked })).status).toBe('error');
    expect(attempts).toEqual(['93.184.215.14:443']);
    expect(blocked).toEqual([]);
    await context.close();
  });

  it('follows 5 redirects and refuses a 6th', async () => {
    const server = await serveFixtureHttp('redirect-chain');
    const http = 'http://site.fixture.in/';
    try {
      const five = await open('redirect-chain', { dial: server.dial });
      expect((await loadPage(five.page, `${http}hop2`, { blocked: five.blocked })).status).toBe('loaded');
      expect(five.page.url()).toBe(`${http}end.html`);
      await five.context.close();

      const six = await open('redirect-chain', { dial: server.dial });
      expect((await loadPage(six.page, `${http}hop1`, { blocked: six.blocked })).status).toBe('blocked');
      expect(six.blocked).toEqual([{ host: 'site.fixture.in', reason: 'redirects' }]);
      await six.context.close();
    } finally {
      await server.close();
    }
  });
});

describe('context hardening', () => {
  it('refuses downloads', async () => {
    const { context, page, blocked } = await open('download');
    await loadPage(page, SITE, { blocked });
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#dl')]);
    expect(await download.failure()).not.toBeNull();
    await context.close();
  });

  it('sends a desktop Chromium user agent with our suffix', async () => {
    const { context, page, blocked } = await open('download');
    await loadPage(page, SITE, { blocked });
    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua).toContain(UA_SUFFIX);
    expect(ua).not.toContain('HeadlessChrome');
    await context.close();
  });
});

describe('loadPage', () => {
  it('returns within its budget on a page that never goes idle, as loaded but not settled', async () => {
    const { context, page, blocked } = await open('never-settles');
    const started = Date.now();
    const outcome = await loadPage(page, SITE, { blocked, timeoutMs: 2_000 });
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(outcome).toMatchObject({ status: 'loaded', settled: false });
    await context.close();
  });

  it('settles on a quiet page', async () => {
    const { context, page, blocked } = await open('redirect-chain');
    expect(await loadPage(page, SITE, { blocked })).toEqual({ status: 'loaded', httpStatus: 200, settled: true });
    await context.close();
  });
});
