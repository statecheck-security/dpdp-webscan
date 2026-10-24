// WS-4b: banner detection, control roles and the persistent control, on inline pages (no network:
// every request is aborted). The click paths run end to end in scan.browser.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { findBanner, findPersistentControl } from '../src/banner.js';
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
    expect(await findBanner(page)).toBeUndefined();
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
