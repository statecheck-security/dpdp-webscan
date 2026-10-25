// W2: identifiers set before any interaction, from hand-built contexts.
import { describe, expect, it } from 'vitest';
import { detectW2 } from '../../src/checks/w2.js';
import { context, cookie, snapshot, storage } from './context.js';

describe('detectW2', () => {
  it('is quiet with no cookies or storage keys', () => {
    expect(detectW2(context())).toBeUndefined();
  });

  it('reports cookie names and storage keys, cookies first, never values', () => {
    const baseline = snapshot({
      cookies: [
        cookie('_ga', 'example.in', { expiresInSeconds: 63_072_000 }),
        cookie('IDE', 'doubleclick.net', { expiresInSeconds: 33_696_000 }),
      ],
      storage: [
        storage('https://www.example.in', ['site_pref']),
        storage('https://www.example.in', ['tab'], { store: 'sessionStorage', keysSetSinceMark: [] }),
      ],
    });
    expect(detectW2(context({ baseline }))).toEqual({
      id: 'W2',
      evidence: {
        identifiers: [
          { name: 'IDE', domain: 'doubleclick.net', store: 'cookie', firstParty: false, expiresInSeconds: 33_696_000 },
          { name: '_ga', domain: 'example.in', store: 'cookie', firstParty: true, expiresInSeconds: 63_072_000 },
          { name: 'site_pref', domain: 'www.example.in', store: 'localStorage', firstParty: true },
          { name: 'tab', domain: 'www.example.in', store: 'sessionStorage', firstParty: true },
        ],
      },
    });
  });

  it.each(['PHPSESSID', 'csrftoken', 'XSRF-TOKEN', '__cf_bm', 'AWSALB', 'OptanonConsent', 'CookieConsent'])(
    'leaves out the first-party %s cookie',
    (name) => {
      expect(detectW2(context({ baseline: snapshot({ cookies: [cookie(name)] }) }))).toBeUndefined();
    },
  );

  it.each(['shopname_session', 'my_app_2_session'])(
    "leaves out %s next to Laravel's XSRF-TOKEN, as its session cookie",
    (name) => {
      const baseline = snapshot({ cookies: [cookie('XSRF-TOKEN'), cookie(name)] });
      expect(detectW2(context({ baseline }))).toBeUndefined();
    },
  );

  it("counts an <app>_session cookie without Laravel's XSRF-TOKEN, or with a third-party one", () => {
    const alone = snapshot({ cookies: [cookie('shopname_session')] });
    expect(detectW2(context({ baseline: alone }))?.evidence.identifiers?.map((i) => i.name)).toEqual([
      'shopname_session',
    ]);
    const foreign = snapshot({ cookies: [cookie('XSRF-TOKEN', 'other.in'), cookie('shopname_session')] });
    expect(detectW2(context({ baseline: foreign }))?.evidence.identifiers?.map((i) => i.name)).toEqual([
      'XSRF-TOKEN',
      'shopname_session',
    ]);
  });

  it.each(['_session', 'Shop_session', 'shop_session_id', 'shop-app_session'])(
    'counts %s even next to XSRF-TOKEN: not a Laravel session name',
    (name) => {
      const baseline = snapshot({ cookies: [cookie('XSRF-TOKEN'), cookie(name)] });
      expect(detectW2(context({ baseline }))?.evidence.identifiers?.map((i) => i.name)).toEqual([name]);
    },
  );

  it('never treats a storage key shaped like a session cookie as benign', () => {
    const baseline = snapshot({
      cookies: [cookie('XSRF-TOKEN')],
      storage: [storage('https://www.example.in', ['shopname_session'])],
    });
    expect(detectW2(context({ baseline }))?.evidence.identifiers?.map((i) => i.name)).toEqual(['shopname_session']);
  });

  it('counts a benign name when a third party sets it', () => {
    const finding = detectW2(context({ baseline: snapshot({ cookies: [cookie('__cf_bm', 'cdn.vendor.in')] }) }));
    expect(finding?.evidence.identifiers?.map((i) => i.name)).toEqual(['__cf_bm']);
  });

  it('matches benign names exactly, not as a prefix', () => {
    const finding = detectW2(context({ baseline: snapshot({ cookies: [cookie('PHPSESSID_track')] }) }));
    expect(finding?.evidence.identifiers?.map((i) => i.name)).toEqual(['PHPSESSID_track']);
  });
});
