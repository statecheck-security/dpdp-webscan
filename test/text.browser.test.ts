// WS-5a: page text extraction on inline pages (every request aborted).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext } from 'playwright';
import { killBrowser, launchBrowser } from '../src/browser.js';
import { silentLog } from '../src/log.js';
import { extractText } from '../src/text.js';

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

describe('extractText', () => {
  it('keeps line breaks, collapses spaces, and lists lang attributes', async () => {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html lang="en-IN"><body>
      <h1>Privacy   Policy</h1>
      <p>We   reply within 30 days.</p>
      <p lang="hi">हिन्दी</p>
      <p style="display:none">Hidden text is not read.</p>
    </body></html>`);
    const text = await extractText(page);
    expect(text?.text).toBe('Privacy Policy\nWe reply within 30 days.\nहिन्दी');
    expect(text?.langs).toEqual(['en-in', 'hi']);
    expect(text?.hasMailto).toBe(false);
    await page.close();
  });

  it('keeps a table row on one line, its cells separated by tabs', async () => {
    const page = await context.newPage();
    await page.setContent(`<table>
      <tr><td>Right to withdraw consent</td><td>Withdraw at any time.</td><td>Email us</td></tr>
      <tr><td>Right to erasure</td><td>Request deletion.</td><td>Email us</td></tr>
    </table>`);
    expect((await extractText(page))?.text).toBe(
      'Right to withdraw consent\tWithdraw at any time.\tEmail us\nRight to erasure\tRequest deletion.\tEmail us',
    );
    await page.close();
  });

  it('notices a mailto link', async () => {
    const page = await context.newPage();
    await page.setContent('<p>Write to <a href="MAILTO:privacy@example.in">us</a>.</p>');
    expect((await extractText(page))?.hasMailto).toBe(true);
    await page.close();
  });
});
