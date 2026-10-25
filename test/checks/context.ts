// Hand-built CheckContexts for the pure check tests (plan section 10): no browser, milliseconds per test.
import type { BannerButton, BannerInfo, ButtonRole } from '../../src/banner.js';
import type { CaptureSnapshot, CapturedCookie, CapturedStorage, RequestCount } from '../../src/capture.js';
import type { CheckContext } from '../../src/checks/context.js';
import type { FormInfo } from '../../src/forms.js';
import { categorise } from '../../src/data/trackers.js';

export const PAGE = 'https://www.example.in/';

export function request(host: string, extra: Partial<RequestCount> = {}): RequestCount {
  return {
    host,
    pageUrl: PAGE,
    resourceType: 'script',
    isThirdParty: host !== 'www.example.in' && !host.endsWith('.example.in'),
    count: 1,
    ...extra,
  };
}

export function cookie(name: string, domain = 'www.example.in', extra: Partial<CapturedCookie> = {}): CapturedCookie {
  return {
    name,
    domain,
    firstParty: domain === 'example.in' || domain.endsWith('.example.in'),
    setSinceMark: true,
    ...extra,
  };
}

export function storage(origin: string, keys: string[], extra: Partial<CapturedStorage> = {}): CapturedStorage {
  return {
    origin,
    store: 'localStorage',
    firstParty: new URL(origin).hostname.endsWith('example.in'),
    keys,
    keysSetSinceMark: keys,
    ...extra,
  };
}

export function snapshot(parts: Partial<CaptureSnapshot> = {}): CaptureSnapshot {
  return {
    label: 'baseline',
    takenAt: '2026-10-24T10:00:00.000Z',
    requests: [request('www.example.in', { resourceType: 'document' })],
    requestsDropped: 0,
    cookies: [],
    storage: [],
    ...parts,
  };
}

export function context(parts: Partial<CheckContext> = {}): CheckContext {
  return {
    target: new URL(PAGE),
    registrableDomain: 'example.in',
    pages: [{ url: PAGE, reason: 'requested', status: 'loaded', httpStatus: 200 }],
    baseline: snapshot(),
    persistentControlFoundOn: [],
    forms: [],
    texts: new Map(),
    trackers: categorise,
    ...parts,
  };
}

export function button(role: ButtonRole, label: string = role, clicksFromFirstLayer = 1): BannerButton {
  return { label, role, visible: true, clicksFromFirstLayer, ref: `b-${label}` };
}

export function banner(buttons: BannerButton[], text = 'We use cookies.', vendor?: string): BannerInfo {
  return { text, buttons, ...(vendor ? { vendor } : {}) };
}

/** A same-site POST form with a personal email field, unless `parts` says otherwise. */
export function form(parts: Partial<FormInfo> = {}): FormInfo {
  return {
    pageUrl: PAGE,
    method: 'post',
    actionHost: 'www.example.in',
    actionScheme: 'https',
    actionThirdParty: false,
    scriptHandled: false,
    fields: [{ type: 'email', name: 'email', personal: true }],
    checkboxes: [],
    ...parts,
  };
}
