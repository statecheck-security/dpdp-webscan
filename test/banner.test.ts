// WS-11c: which child frames the banner search may enter. Pure: no browser.
import { describe, expect, it } from 'vitest';
import { frameSource } from '../src/banner.js';

const PAGE = 'https://www.shop.co.in/products';

describe('frameSource', () => {
  it.each([
    ['https://cdn.privacy-mgmt.com/index.html?message_id=1', { vendor: 'Sourcepoint' }],
    ['https://privacy-mgmt.com/', { vendor: 'Sourcepoint' }],
    ['https://consent-pref.trustarc.com/?type=x', { vendor: 'TrustArc' }],
    ['https://cmp.shop.co.in/message', {}],
    ['https://shop.co.in/consent.html', {}],
  ])('searches %s', (frameUrl, expected) => {
    expect(frameSource(frameUrl, PAGE)).toEqual(expected);
  });

  it.each([
    ['another company', 'https://widgets.chatvendor.com/frame'],
    ['a look-alike domain', 'https://privacy-mgmt.com.evil.in/'],
    ['a suffix without a dot', 'https://notprivacy-mgmt.com/'],
    ['another tenant of a hosting platform', 'https://other.vercel.app/'],
    ['about:blank', 'about:blank'],
    ['a data: frame', 'data:text/html,<p>cookies</p>'],
    ['a malformed URL', 'not a url'],
  ])('never searches %s', (_name, frameUrl) => {
    expect(frameSource(frameUrl, PAGE)).toBeUndefined();
  });

  it('treats a hosting-platform tenant as its own site only', () => {
    expect(frameSource('https://shop.vercel.app/frame', 'https://shop.vercel.app/')).toEqual({});
    expect(frameSource('https://other.vercel.app/frame', 'https://shop.vercel.app/')).toBeUndefined();
  });

  it('uses the list it is given', () => {
    const frames = [{ vendor: 'CMP Fixture', host: 'cmp-fixture.in' }];
    expect(frameSource('https://cmp-fixture.in/banner.html', PAGE, frames)).toEqual({ vendor: 'CMP Fixture' });
    expect(frameSource('https://cdn.privacy-mgmt.com/', PAGE, frames)).toBeUndefined();
  });
});
