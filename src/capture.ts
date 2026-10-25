/**
 * Per-context recorder (WS-3c): which hosts a context contacted, and which
 * cookie names and storage keys it holds at a checkpoint. The orchestrator
 * takes snapshots at `baseline`, `after-reject` and `after-accept`, one
 * context each (CLAUDE.md, decision 4).
 *
 * Redaction at the point of entry (decision 5): hostnames only, never URLs;
 * cookies are read field by field without their value; storage keys are
 * listed inside the page, so values never reach Node. A test plants a
 * sentinel value and checks it never appears in a snapshot.
 */

import type { BrowserContext, Request } from 'playwright';
import { evaluateIn, withTimeout } from './browser.js';
import type { BlockedRequest } from './egress.js';
import { registrableDomain } from './pages.js';

/** Bounds on what one context can make us hold in memory. */
const MAX_REQUESTS = 10_000;
const MAX_KEYS_PER_STORE = 200;
const MAX_KEY_LENGTH = 100;
const STORAGE_READ_TIMEOUT_MS = 2_000;

/** `all-pages`: the baseline context once every scanned page has loaded, still with no click (W8). */
export type SnapshotLabel = 'baseline' | 'after-reject' | 'after-accept' | 'all-pages';

export interface CapturedRequest {
  host: string;
  /** Top-level page the request was made from: origin and path, no query or hash. */
  pageUrl: string;
  resourceType: string;
  isThirdParty: boolean;
}

export interface RequestCount extends CapturedRequest {
  count: number;
}

export interface CapturedCookie {
  name: string;
  /** Cookie domain without a leading dot. */
  domain: string;
  firstParty: boolean;
  /** Seconds from the snapshot to expiry; omitted for session cookies. */
  expiresInSeconds?: number;
  /** Not present at the mark this snapshot was taken against (always true without a mark). */
  setSinceMark: boolean;
}

export interface CapturedStorage {
  origin: string;
  store: 'localStorage' | 'sessionStorage';
  firstParty: boolean;
  keys: string[];
  /** The subset of `keys` not present at the mark (all of them without a mark). */
  keysSetSinceMark: string[];
}

export interface CaptureSnapshot {
  label: SnapshotLabel;
  takenAt: string;
  /** Requests since the mark (or since the context opened), grouped with a count. */
  requests: RequestCount[];
  /** Requests not recorded because the context passed MAX_REQUESTS. */
  requestsDropped: number;
  cookies: CapturedCookie[];
  storage: CapturedStorage[];
}

/** A checkpoint inside one context, e.g. just before a banner click. */
export interface CaptureMark {
  requestIndex: number;
  identifiers: ReadonlySet<string>;
}

export interface Capture {
  mark: () => Promise<CaptureMark>;
  snapshot: (label: SnapshotLabel, since?: CaptureMark) => Promise<CaptureSnapshot>;
  /**
   * The site the scan landed on, when the requested URL redirected to another registrable domain
   * (src/scan.ts). First and third party are decided at snapshot time, so requests already recorded
   * are classified against it too.
   */
  rebase: (registrableDomain: string) => void;
  detach: () => void;
}

export interface CaptureOptions {
  registrableDomain: string;
  /** The context's refusal list (src/browser.ts): hosts the guard blocked are never reported as contacted. */
  blocked: readonly BlockedRequest[];
  now?: () => Date;
}

export function isThirdParty(host: string, siteDomain: string): boolean {
  return registrableDomain(host) !== siteDomain;
}

/** Origin plus path, so query strings and fragments (which can carry identifiers) are never kept. */
function pageAddress(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

/** The top-level page a request belongs to. A main-frame navigation belongs to the page it loads. */
function pageOf(request: Request): string | undefined {
  try {
    const frame = request.frame();
    const page = frame.page();
    if (request.isNavigationRequest() && frame === page.mainFrame()) return pageAddress(request.url());
    return pageAddress(page.url());
  } catch {
    // Service-worker requests have no frame; workers are blocked, so this is rare.
    return undefined;
  }
}

function cookieKey(name: string, domain: string): string {
  return `cookie ${domain} ${name}`;
}

function storageKey(origin: string, store: string, key: string): string {
  return `${store} ${origin} ${key}`;
}

interface FrameStorage {
  origin: string;
  localStorage: string[];
  sessionStorage: string[];
}

export function attachCapture(context: BrowserContext, opts: CaptureOptions): Capture {
  const now = opts.now ?? (() => new Date());
  let siteDomain = opts.registrableDomain;
  const requests: Omit<CapturedRequest, 'isThirdParty'>[] = [];
  let dropped = 0;

  const onRequest = (request: Request): void => {
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (requests.length >= MAX_REQUESTS) {
      dropped += 1;
      return;
    }
    requests.push({
      host: url.hostname.toLowerCase(),
      pageUrl: pageOf(request) ?? '',
      resourceType: request.resourceType(),
    });
  };
  context.on('request', onRequest);

  async function readCookies(): Promise<{ name: string; domain: string; expires: number }[]> {
    // Destructured on purpose: a cookie's value is never copied out of Playwright's object.
    // A context closed by the scan timeout has no cookies to read; the snapshot is still taken (partial).
    const cookies = await context.cookies().catch(() => []);
    return cookies.map(({ name, domain, expires }) => ({ name, domain, expires }));
  }

  async function readStorage(): Promise<FrameStorage[]> {
    const frames = context.pages().flatMap((page) => page.frames());
    const reads = frames.map((frame) =>
      withTimeout(
        evaluateIn(
          frame,
          ({ maxKeys, maxLength }: { maxKeys: number; maxLength: number }): FrameStorage => {
            // Runs in the page: only key names are returned, never values.
            const keysOf = (store: Storage): string[] => {
              const keys: string[] = [];
              for (let i = 0; i < store.length && keys.length < maxKeys; i += 1) {
                const key = store.key(i);
                if (key !== null) keys.push(key.slice(0, maxLength));
              }
              return keys;
            };
            const read = (get: () => Storage): string[] => {
              try {
                return keysOf(get());
              } catch {
                return [];
              }
            };
            return {
              origin: location.origin,
              localStorage: read(() => window.localStorage),
              sessionStorage: read(() => window.sessionStorage),
            };
          },
          { maxKeys: MAX_KEYS_PER_STORE, maxLength: MAX_KEY_LENGTH },
        ).catch(() => undefined),
        STORAGE_READ_TIMEOUT_MS,
        () => undefined,
      ),
    );
    return (await Promise.all(reads)).filter(
      (s): s is FrameStorage => s !== undefined && s.origin !== 'null' && pageAddress(s.origin) !== undefined,
    );
  }

  async function identifiers(): Promise<{
    cookies: { name: string; domain: string; expires: number }[];
    storage: Map<string, { origin: string; store: CapturedStorage['store']; keys: Set<string> }>;
  }> {
    const [cookies, frames] = await Promise.all([readCookies(), readStorage()]);
    // Frames of one origin share their storage; merge them.
    const storage = new Map<string, { origin: string; store: CapturedStorage['store']; keys: Set<string> }>();
    for (const frame of frames) {
      for (const store of ['localStorage', 'sessionStorage'] as const) {
        if (frame[store].length === 0) continue;
        const id = `${store} ${frame.origin}`;
        const entry = storage.get(id) ?? { origin: frame.origin, store, keys: new Set<string>() };
        for (const key of frame[store]) entry.keys.add(key);
        storage.set(id, entry);
      }
    }
    return { cookies, storage };
  }

  return {
    async mark() {
      const requestIndex = requests.length;
      const { cookies, storage } = await identifiers();
      const ids = new Set<string>();
      for (const c of cookies) ids.add(cookieKey(c.name, c.domain));
      for (const s of storage.values()) for (const key of s.keys) ids.add(storageKey(s.origin, s.store, key));
      return { requestIndex, identifiers: ids };
    },

    async snapshot(label, since) {
      const taken = now();
      const { cookies, storage } = await identifiers();
      const refused = new Set(opts.blocked.filter((b) => b.reason === 'ssrf').map((b) => b.host.toLowerCase()));
      const isNew = (key: string): boolean => !since?.identifiers.has(key);

      const counts = new Map<string, RequestCount>();
      for (const r of requests.slice(since?.requestIndex ?? 0)) {
        if (refused.has(r.host)) continue;
        const id = `${r.host} ${r.pageUrl} ${r.resourceType}`;
        const entry = counts.get(id);
        if (entry) entry.count += 1;
        else counts.set(id, { ...r, isThirdParty: isThirdParty(r.host, siteDomain), count: 1 });
      }

      const nowSeconds = taken.getTime() / 1000;
      return {
        label,
        takenAt: taken.toISOString(),
        requests: [...counts.values()],
        requestsDropped: dropped,
        cookies: cookies.map(({ name, domain, expires }) => {
          const bare = domain.replace(/^\./, '').toLowerCase();
          return {
            name,
            domain: bare,
            firstParty: !isThirdParty(bare, siteDomain),
            ...(expires > 0 ? { expiresInSeconds: Math.max(0, Math.round(expires - nowSeconds)) } : {}),
            setSinceMark: isNew(cookieKey(name, domain)),
          };
        }),
        storage: [...storage.values()].map(({ origin, store, keys }) => {
          const list = [...keys];
          return {
            origin,
            store,
            firstParty: !isThirdParty(new URL(origin).hostname, siteDomain),
            keys: list,
            keysSetSinceMark: list.filter((key) => isNew(storageKey(origin, store, key))),
          };
        }),
      };
    },

    rebase(domain) {
      siteDomain = domain;
    },

    detach() {
      context.off('request', onRequest);
    },
  };
}
