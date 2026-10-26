// W6, W8, W9, W10, W11: the form checks, from hand-built contexts.
import { describe, expect, it } from 'vitest';
import { detectW10 } from '../../src/checks/w10.js';
import { detectW11 } from '../../src/checks/w11.js';
import { detectW6 } from '../../src/checks/w6.js';
import { detectW8 } from '../../src/checks/w8.js';
import { detectW9 } from '../../src/checks/w9.js';
import { context, form, PAGE, request, snapshot } from './context.js';

const box = (checked: boolean, consentLike: boolean) => ({
  name: 'optin',
  label: 'Send me offers',
  checked,
  consentLike,
});
const nonPersonal = [{ type: 'text', name: 'company', personal: false }];
const contactPage = `${PAGE}contact`;

describe('every form check', () => {
  it.each([
    ['W6', detectW6],
    ['W8', detectW8],
    ['W9', detectW9],
    ['W10', detectW10],
    ['W11', detectW11],
  ])('%s is quiet with no forms, and on a same-site https POST form with no ticked box', (_id, detect) => {
    expect(detect(context())).toBeUndefined();
    expect(detect(context({ forms: [form({ checkboxes: [box(false, true)] })] }))).toBeUndefined();
  });
});

describe('detectW6', () => {
  it('reports a ticked consent box, with the form but not its label', () => {
    const ticked = form({
      fields: [
        { type: 'email', name: 'email', personal: true },
        { type: 'checkbox', name: 'optin', personal: false },
      ],
      checkboxes: [box(true, true)],
    });
    expect(detectW6(context({ forms: [ticked] }))).toEqual({
      id: 'W6',
      evidence: {
        form: {
          pageUrl: PAGE,
          method: 'post',
          actionHost: 'www.example.in',
          actionScheme: 'https',
          fields: [
            { type: 'email', name: 'email' },
            { type: 'checkbox', name: 'optin' },
          ],
        },
      },
    });
  });

  it('ignores a ticked box that is not about consent', () => {
    expect(detectW6(context({ forms: [form({ checkboxes: [box(true, false)] })] }))).toBeUndefined();
  });

  it('counts a form with no personal field too', () => {
    expect(detectW6(context({ forms: [form({ fields: nonPersonal, checkboxes: [box(true, true)] })] }))?.id).toBe('W6');
  });
});

describe('detectW8', () => {
  const replayOn = (page: string) =>
    snapshot({ label: 'all-pages', requests: [request('www.clarity.ms', { pageUrl: page })] });

  it('reports a replay script on the page of a personal form', () => {
    const ctx = context({ forms: [form({ pageUrl: contactPage })], allPages: replayOn(contactPage) });
    const finding = detectW8(ctx);
    expect(finding?.evidence.thirdParties).toEqual([
      {
        host: 'www.clarity.ms',
        vendor: 'Microsoft Clarity',
        country: 'US',
        category: 'session-replay',
        pageUrl: contactPage,
        count: 1,
      },
    ]);
    expect(finding?.evidence.form?.pageUrl).toBe(contactPage);
  });

  it('ignores replay on a different page from the form', () => {
    expect(detectW8(context({ forms: [form({ pageUrl: contactPage })], allPages: replayOn(PAGE) }))).toBeUndefined();
  });

  it('ignores a form with no personal field', () => {
    expect(detectW8(context({ forms: [form({ fields: nonPersonal })], allPages: replayOn(PAGE) }))).toBeUndefined();
  });

  it('ignores analytics that does not record sessions', () => {
    const allPages = snapshot({ requests: [request('www.google-analytics.com')] });
    expect(detectW8(context({ forms: [form()], allPages }))).toBeUndefined();
  });

  it('falls back to the baseline when the scan ran out of time before the all-pages snapshot', () => {
    expect(detectW8(context({ forms: [form()], baseline: replayOn(PAGE) }))?.id).toBe('W8');
  });

  // WS-11d: replay that waits for "accept" still records the form.
  it('reports replay loaded only after accept, on the form page', () => {
    const afterAccept = snapshot({ label: 'after-accept', requests: [request('www.clarity.ms')] });
    const finding = detectW8(context({ forms: [form()], allPages: snapshot(), afterAccept }));
    expect(finding?.evidence.thirdParties?.map((r) => r.host)).toEqual(['www.clarity.ms']);
  });

  it('prefers what loaded before any choice when both runs show replay', () => {
    const allPages = snapshot({ requests: [request('www.clarity.ms')] });
    const afterAccept = snapshot({ label: 'after-accept', requests: [request('www.hotjar.com', { count: 3 })] });
    const finding = detectW8(context({ forms: [form()], allPages, afterAccept }));
    expect(finding?.evidence.thirdParties?.map((r) => r.host)).toEqual(['www.clarity.ms']);
  });

  it('ignores replay after accept on another page than the form', () => {
    const afterAccept = snapshot({ label: 'after-accept', requests: [request('www.clarity.ms')] });
    const forms = [form({ pageUrl: contactPage })];
    expect(detectW8(context({ forms, allPages: snapshot(), afterAccept }))).toBeUndefined();
  });
});

describe('detectW9', () => {
  const thirdParty = (host: string) => form({ actionHost: host, actionThirdParty: true });

  it('reports a personal form posting to another company', () => {
    expect(detectW9(context({ forms: [thirdParty('forms.vendor.in')] }))?.evidence.form?.actionHost).toBe(
      'forms.vendor.in',
    );
  });

  it.each(['api.razorpay.com', 'checkout.stripe.com', 'secure.ccavenue.com'])(
    'never reports a payment gateway (%s)',
    (host) => {
      expect(detectW9(context({ forms: [thirdParty(host)] }))).toBeUndefined();
    },
  );

  it('ignores a third-party form with no personal field', () => {
    const f = form({ actionHost: 'forms.vendor.in', actionThirdParty: true, fields: nonPersonal });
    expect(detectW9(context({ forms: [f] }))).toBeUndefined();
  });
});

describe('detectW10', () => {
  it('reports a personal form on a plain-http page', () => {
    const f = form({ pageUrl: 'http://www.example.in/', actionScheme: 'http' });
    expect(detectW10(context({ forms: [f] }))?.evidence.form?.pageUrl).toBe('http://www.example.in/');
  });

  it('reports an https page whose form posts over http', () => {
    expect(detectW10(context({ forms: [form({ actionScheme: 'http' })] }))?.id).toBe('W10');
  });

  it('ignores an http form with no personal field', () => {
    expect(detectW10(context({ forms: [form({ actionScheme: 'http', fields: nonPersonal })] }))).toBeUndefined();
  });
});

describe('detectW11', () => {
  it('reports a personal form sent by GET', () => {
    expect(detectW11(context({ forms: [form({ method: 'get' })] }))?.evidence.form?.method).toBe('get');
  });

  it('ignores a form a script submits (no method, no action)', () => {
    expect(detectW11(context({ forms: [form({ method: 'get', scriptHandled: true })] }))).toBeUndefined();
  });

  it('ignores a GET form with no personal field', () => {
    expect(detectW11(context({ forms: [form({ method: 'get', fields: nonPersonal })] }))).toBeUndefined();
  });
});
