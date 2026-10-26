// W3: trackers still fire after "reject", from hand-built contexts.
import { describe, expect, it } from 'vitest';
import type { CaptureSnapshot } from '../../src/capture.js';
import { detectW3 } from '../../src/checks/w3.js';
import { context, cookie, PAGE, request, snapshot, storage } from './context.js';

const afterReject = (parts: Partial<CaptureSnapshot>) => snapshot({ label: 'after-reject', requests: [], ...parts });

describe('detectW3', () => {
  it('is quiet without a reject run', () => {
    const baseline = snapshot({ requests: [request('connect.facebook.net')] });
    expect(detectW3(context({ baseline }))).toBeUndefined();
  });

  it('is quiet when reject stops everything', () => {
    expect(detectW3(context({ afterReject: afterReject({}) }))).toBeUndefined();
  });

  // WS-11d: a CMP saving or checking the choice is not tracking.
  it('is quiet when only CMP endpoints are contacted after the click', () => {
    const run = afterReject({
      requests: [
        request('geolocation.onetrust.com'),
        request('cdn.privacy-mgmt.com'),
        request('fundingchoicesmessages.google.com'),
        request('vendor-list.consensu.org'),
      ],
    });
    expect(detectW3(context({ afterReject: run }))).toBeUndefined();
  });

  it('reports trackers contacted and identifiers set after the click', () => {
    const run = afterReject({
      requests: [request('connect.facebook.net', { count: 2 }), request('cdn.cookielaw.org')],
      cookies: [
        cookie('_fbp', 'example.in', { expiresInSeconds: 7_776_000 }),
        cookie('old', 'example.in', { setSinceMark: false }),
      ],
      storage: [storage('https://www.example.in', ['seen', 'later'], { keysSetSinceMark: ['later'] })],
    });
    expect(detectW3(context({ afterReject: run }))).toEqual({
      id: 'W3',
      evidence: {
        thirdParties: [
          { host: 'connect.facebook.net', vendor: 'Meta Pixel', category: 'ads', pageUrl: PAGE, count: 2 },
        ],
        identifiers: [
          { name: '_fbp', domain: 'example.in', store: 'cookie', firstParty: true, expiresInSeconds: 7_776_000 },
          { name: 'later', domain: 'www.example.in', store: 'localStorage', firstParty: true },
        ],
      },
    });
  });

  it("does not count the CMP's own request or the cookie that stores the choice", () => {
    const run = afterReject({ requests: [request('cdn.cookielaw.org')], cookies: [cookie('OptanonConsent')] });
    expect(detectW3(context({ afterReject: run }))).toBeUndefined();
  });

  it('fires on an identifier alone', () => {
    const finding = detectW3(context({ afterReject: afterReject({ cookies: [cookie('trk')] }) }));
    expect(finding?.evidence).toEqual({
      identifiers: [{ name: 'trk', domain: 'www.example.in', store: 'cookie', firstParty: true }],
    });
  });
});
