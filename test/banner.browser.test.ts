// WS-4b: banner detection, control roles and the persistent control, on inline pages (no network:
// every request is aborted). The click paths run end to end in scan.browser.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { bannerFinder, findBanner, findPersistentControl } from '../src/banner.js';
import { killBrowser, launchBrowser } from '../src/browser.js';
import { silentLog } from '../src/log.js';

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  browser = await launchBrowser();
  context = await browser.newContext();
  await context.route('**/*', (route) => route.abort());
});

afterAll(async () => {
  await context.close();
  await killBrowser(browser, silentLog);
});

async function pageWith(body: string): Promise<Page> {
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><body>${body}</body></html>`);
  return page;
}

const fixed = 'style="position: fixed; bottom: 0"';

describe('findBanner', () => {
  it('finds a generic fixed banner and classifies its controls', async () => {
    const page = await pageWith(`
      <div class="cookie-bar" ${fixed}>
        <p>We use cookies for analytics.</p>
        <button>Accept only necessary</button>
        <button>Manage preferences</button>
        <button>Accept all</button>
        <a href="/cookies">Cookie policy</a>
      </div>`);
    const banner = await findBanner(page);
    expect(banner?.vendor).toBeUndefined();
    expect(banner?.text).toContain('We use cookies for analytics.');
    expect(banner?.buttons.map((b) => [b.label, b.role])).toEqual([
      ['Accept only necessary', 'reject'],
      ['Manage preferences', 'settings'],
      ['Accept all', 'accept'],
    ]);
    await page.close();
  });

  it('names a known CMP', async () => {
    const page = await pageWith(`
      <div id="CybotCookiebotDialog" ${fixed}><p>This website uses cookies.</p>
        <button>Deny</button><button>Allow all</button></div>`);
    expect((await findBanner(page))?.vendor).toBe('Cookiebot');
    await page.close();
  });

  it('finds a banner inside an open shadow root', async () => {
    const page = await pageWith(`<div id="host"></div>
      <script>
        const root = document.getElementById('host').attachShadow({ mode: 'open' });
        root.innerHTML = '<div role="dialog" ${fixed}><p>We use cookies.</p><button>Reject</button><button>Accept</button></div>';
      </script>`);
    expect((await findBanner(page))?.buttons.map((b) => b.role)).toEqual(['reject', 'accept']);
    await page.close();
  });

  it.each([
    ['a hidden banner', `<div class="cookie-bar" ${fixed} hidden><p>We use cookies.</p><button>Accept</button></div>`],
    ['a footer of policy links', '<footer><a href="/cookies" id="cookie-link">Cookie settings</a></footer>'],
    [
      'a newsletter popup',
      `<div role="dialog" ${fixed}><p>Get 10% off your first order.</p><button>No thanks</button><button>Subscribe</button></div>`,
    ],
    [
      'a cookie box with no choice',
      `<div class="cookie-bar" ${fixed}><p>We use cookies.</p><button>Close</button></div>`,
    ],
  ])('ignores %s', async (_name, body) => {
    const page = await pageWith(body);
    expect(await bannerFinder(0)(page)).toBeUndefined();
    await page.close();
  });

  // WS-11b: "More information" is a settings control only where a CMP selector proves the consent layer.
  it('does not take "More information" for settings on a generic banner', async () => {
    const page = await pageWith(`
      <div class="cookie-bar" ${fixed}><p>We use cookies.</p>
        <button>More information</button><a href="/privacy">More info</a><button>Accept</button></div>`);
    expect((await findBanner(page))?.buttons.map((b) => [b.label, b.role])).toEqual([
      ['More information', 'other'],
      ['Accept', 'accept'],
    ]);
    await page.close();
  });

  it('takes "More information" for settings inside a known CMP banner', async () => {
    const page = await pageWith(`
      <div id="CybotCookiebotDialog" ${fixed}><p>This website uses cookies.</p>
        <a href="#">More information</a><button>Allow all</button></div>`);
    expect((await findBanner(page))?.buttons.map((b) => [b.label, b.role])).toEqual([
      ['More information', 'settings'],
      ['Allow all', 'accept'],
    ]);
    await page.close();
  });

  it('keeps looking for a banner drawn late, within the wait', async () => {
    const page = await pageWith(`<script>
      setTimeout(() => {
        document.body.insertAdjacentHTML('beforeend',
          '<div class="cookie-bar" style="position: fixed; bottom: 0"><p>We use cookies.</p><button>Reject</button><button>Accept</button></div>');
      }, 700);
    </script>`);
    expect(await bannerFinder(0)(page)).toBeUndefined();
    expect((await bannerFinder(3_000)(page))?.buttons.map((b) => b.role)).toEqual(['reject', 'accept']);
    await page.close();
  });

  it('gives up after the wait when there is no banner', async () => {
    const page = await pageWith('<main><p>No banner here.</p></main>');
    const started = Date.now();
    expect(await bannerFinder(600)(page)).toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(500);
    expect(Date.now() - started).toBeLessThan(3_000);
    await page.close();
  });
});

describe('findPersistentControl', () => {
  it('finds a footer link outside the banner', async () => {
    const page = await pageWith(`
      <div class="cookie-bar" ${fixed}><p>We use cookies.</p><button>Reject</button><button>Accept</button></div>
      <footer><a href="#">Cookie settings</a></footer>`);
    expect(await findPersistentControl(page)).toBe(true);
    await page.close();
  });

  it("does not count the banner's own settings button", async () => {
    const page = await pageWith(`
      <div class="cookie-bar" ${fixed}><p>We use cookies.</p>
        <button>Cookie settings</button><button>Accept</button></div>
      <footer><a href="/cookies">Cookie policy</a></footer>`);
    expect(await findPersistentControl(page)).toBe(false);
    await page.close();
  });

  it("counts a CMP's reopen control even while it is hidden", async () => {
    const page = await pageWith('<div id="CookiebotWidget" hidden></div>');
    expect(await findPersistentControl(page)).toBe(true);
    await page.close();
  });
});
