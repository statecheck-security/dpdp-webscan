// WS-4c: static form inspection on inline pages (every request aborted). The checks run end to end in
// scan.browser.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { killBrowser, launchBrowser } from '../src/browser.js';
import { inspectForms } from '../src/forms.js';
import { silentLog } from '../src/log.js';

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  browser = await launchBrowser();
  context = await browser.newContext();
  await context.route('**/*', (route) =>
    route.request().url().startsWith('https://www.example.in/form')
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' })
      : route.abort(),
  );
});

afterAll(async () => {
  await context.close();
  await killBrowser(browser, silentLog);
});

/** A page at a real-looking https URL, so actions resolve against it. */
async function pageWith(body: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto('https://www.example.in/form?ref=SECRET-VALUE-DO-NOT-RECORD');
  await page.setContent(`<!doctype html><html><body>${body}</body></html>`);
  return page;
}

describe('inspectForms', () => {
  it('records method, action, field types and names, and which fields are personal', async () => {
    const page = await pageWith(`
      <form method="POST" action="https://forms.vendor.in/submit">
        <input name="full_name" autocomplete="name">
        <input type="email" name="work" value="SECRET-VALUE-DO-NOT-RECORD">
        <input name="contact_no" placeholder="Mobile number">
        <input name="company">
        <select name="city"><option>SECRET-VALUE-DO-NOT-RECORD</option></select>
        <textarea name="message">SECRET-VALUE-DO-NOT-RECORD</textarea>
        <input type="hidden" name="csrf" value="SECRET-VALUE-DO-NOT-RECORD">
        <button type="submit">Send</button>
      </form>`);
    const forms = await inspectForms(page);
    expect(forms).toEqual([
      {
        pageUrl: 'https://www.example.in/form',
        method: 'post',
        actionHost: 'forms.vendor.in',
        actionScheme: 'https',
        actionThirdParty: true,
        scriptHandled: false,
        fields: [
          { type: 'text', name: 'full_name', autocomplete: 'name', personal: true },
          { type: 'email', name: 'work', personal: true },
          { type: 'text', name: 'contact_no', personal: true },
          { type: 'text', name: 'company', personal: false },
          { type: 'select', name: 'city', personal: false },
          { type: 'textarea', name: 'message', personal: false },
        ],
        checkboxes: [],
      },
    ]);
    expect(JSON.stringify(forms)).not.toContain('SECRET-VALUE-DO-NOT-RECORD');
    await page.close();
  });

  it('reads ticked boxes and whether their label reads as consent, but never a value', async () => {
    const page = await pageWith(`
      <form method="post" action="/signup">
        <input type="email" name="email">
        <input type="checkbox" id="m" name="marketing" value="SECRET-VALUE-DO-NOT-RECORD" checked>
        <label for="m">Yes, send me offers by WhatsApp</label>
        <label><input type="checkbox" name="remember"> Remember me</label>
      </form>`);
    const [form] = await inspectForms(page);
    expect(form?.checkboxes).toEqual([
      { name: 'marketing', label: 'Yes, send me offers by WhatsApp', checked: true, consentLike: true },
      { name: 'remember', label: 'Remember me', checked: false, consentLike: false },
    ]);
    expect(form).toMatchObject({ actionHost: 'www.example.in', actionThirdParty: false, scriptHandled: false });
    expect(JSON.stringify(form)).not.toContain('SECRET-VALUE-DO-NOT-RECORD');
    await page.close();
  });

  it('defaults to GET, flags a form with neither method nor action, and survives fields that shadow them', async () => {
    const page = await pageWith(`
      <form><input type="tel" name="phone"></form>
      <form method="get" action="/subscribe"><input name="action"><input name="method"><input type="email" name="e"></form>`);
    const forms = await inspectForms(page);
    expect(forms.map((f) => [f.method, f.actionHost, f.scriptHandled])).toEqual([
      ['get', 'www.example.in', true],
      ['get', 'www.example.in', false],
    ]);
    await page.close();
  });

  it.each([
    ['a search box', '<form action="/search"><input type="search" name="query"></form>'],
    ['a one-field form named q', '<form action="/find"><input name="q"></form>'],
  ])('leaves out %s', async (_name, body) => {
    const page = await pageWith(body);
    expect(await inspectForms(page)).toEqual([]);
    await page.close();
  });

  it('cuts a long checkbox label to 25 words', async () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const page = await pageWith(`<form method="post"><label><input type="checkbox" name="c"> ${long}</label></form>`);
    const [form] = await inspectForms(page);
    expect(form?.checkboxes[0]?.label.split(' ')).toHaveLength(25);
    await page.close();
  });
});
