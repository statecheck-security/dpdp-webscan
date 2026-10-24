// W7: no persistent way to change consent later, from hand-built contexts.
import { describe, expect, it } from 'vitest';
import { detectW7 } from '../../src/checks/w7.js';
import { banner, button, context, PAGE } from './context.js';

const withBanner = banner([button('reject'), button('accept')]);

describe('detectW7', () => {
  it('is quiet without a banner (the banner info item covers it)', () => {
    expect(detectW7(context())).toBeUndefined();
  });

  it('is quiet when any scanned page has a persistent control', () => {
    expect(detectW7(context({ banner: withBanner, persistentControlFoundOn: [`${PAGE}privacy`] }))).toBeUndefined();
  });

  it('lists the loaded pages it searched', () => {
    const ctx = context({
      banner: withBanner,
      pages: [
        { url: PAGE, reason: 'requested', status: 'loaded', httpStatus: 200 },
        { url: `${PAGE}privacy`, reason: 'privacy', status: 'loaded', httpStatus: 200 },
        { url: `${PAGE}contact`, reason: 'contact', status: 'skipped-robots' },
      ],
    });
    expect(detectW7(ctx)).toEqual({ id: 'W7', evidence: { pagesSearched: [PAGE, `${PAGE}privacy`] } });
  });
});
