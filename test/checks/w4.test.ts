// W4: accept on the first layer, reject not, from hand-built contexts.
import { describe, expect, it } from 'vitest';
import { detectW4 } from '../../src/checks/w4.js';
import { banner, button, context } from './context.js';

describe('detectW4', () => {
  it('is quiet without a banner', () => {
    expect(detectW4(context())).toBeUndefined();
  });

  it('is quiet when reject sits next to accept', () => {
    expect(detectW4(context({ banner: banner([button('reject'), button('accept')]) }))).toBeUndefined();
  });

  it('is quiet when the banner offers no accept either', () => {
    expect(detectW4(context({ banner: banner([button('settings')]) }))).toBeUndefined();
  });

  it('reports the extra clicks and the vendor when reject is behind settings', () => {
    const ctx = context({
      banner: banner([button('settings'), button('accept')], 'We use cookies.', 'OneTrust'),
      rejectClicks: 2,
    });
    expect(detectW4(ctx)).toEqual({ id: 'W4', evidence: { clicksToReject: 2, bannerVendor: 'OneTrust' } });
  });

  it('reports no click count when no reject was reached at all', () => {
    expect(detectW4(context({ banner: banner([button('accept', 'Got it')]) }))).toEqual({ id: 'W4', evidence: {} });
  });
});
