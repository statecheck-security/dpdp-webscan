// WS-3d: page discovery and robots.txt through a hardened context, against local fixtures only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { killBrowser, launchBrowser, loadPage, newHardenedContext } from '../src/browser.js';
import { contextRobotsFetcher, discoverPages, robotsPolicy } from '../src/pages.js';
import { silentLog } from '../src/log.js';
import { fixtureContextOptions, SITE } from './fixtures.js';

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await killBrowser(browser, silentLog);
});

async function open(fixture: string) {
  const { options, routing } = fixtureContextOptions(fixture);
  const hardened = await newHardenedContext(browser, options);
  const page = await hardened.context.newPage();
  return { ...hardened, page, routing };
}

describe('discoverPages', () => {
  it('finds the four extra pages on policy-complete, in order, and skips the decoys', async () => {
    const { context, page, blocked, routing } = await open('policy-complete');
    await loadPage(page, SITE, { blocked });
    expect(await discoverPages(page, new URL(SITE))).toEqual([
      { url: 'https://site.fixture.in/privacy', reason: 'privacy' },
      { url: 'https://site.fixture.in/legal/cookies', reason: 'cookies' },
      { url: 'https://site.fixture.in/contact', reason: 'contact' },
      { url: 'https://site.fixture.in/help/grievance', reason: 'grievance' },
    ]);
    expect(routing.unrouted).toEqual([]);
    await context.close();
  });
});

describe('contextRobotsFetcher', () => {
  it('reads robots.txt through the context and applies it', async () => {
    const { context, blocked } = await open('robots-disallow');
    const pagesBefore = context.pages().length;
    const fetched = await contextRobotsFetcher(context, { blocked })('https://site.fixture.in');
    expect(fetched.status).toBe('found');
    const allows = robotsPolicy(fetched);
    expect(allows(new URL('https://site.fixture.in/contact'))).toBe(false);
    expect(allows(new URL('https://site.fixture.in/privacy'))).toBe(true);
    // The fetch page is closed again; nothing is left open in the context.
    expect(context.pages()).toHaveLength(pagesBefore);
    await context.close();
  });

  it('treats a 404 as no rules', async () => {
    const { context, blocked } = await open('policy-complete');
    expect(await contextRobotsFetcher(context, { blocked })('https://site.fixture.in')).toEqual({ status: 'absent' });
    await context.close();
  });

  it('treats an origin the guard refuses as unreachable, so nothing extra is visited', async () => {
    const { context, blocked } = await open('policy-complete');
    expect(await contextRobotsFetcher(context, { blocked })('https://private.fixture.in')).toEqual({
      status: 'unreachable',
    });
    expect(blocked).toContainEqual({ host: 'private.fixture.in', reason: 'ssrf' });
    await context.close();
  });
});
