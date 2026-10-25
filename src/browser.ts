/**
 * Chromium launch, hardened contexts and page loading (WS-3b, plan section 4).
 *
 * Two app-level SSRF layers per context, sharing one `blocked` list:
 *  - `context.route` re-runs the src/guard.ts checks on the first URL of every
 *    request and aborts early with a clear reason;
 *  - every connection, redirect hops included, goes through the egress proxy
 *    (src/egress.ts), because route handlers never see redirect hops.
 * Real scans also run behind docker/egress.sh (WS-3f).
 */

import { chromium } from 'playwright';
import type { Browser, BrowserContext, Frame, Page, Request } from 'playwright';
import { allowedAddress, startEgressProxy } from './egress.js';
import type { BlockedRequest, Dial } from './egress.js';
import type { Lookup } from './guard.js';
import type { Logger } from './log.js';

export type { BlockedRequest } from './egress.js';

export const PAGE_TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 5;
/**
 * After `load`, how long we wait for the network to go idle. Sites with chat widgets or analytics
 * beacons never go idle, and waiting the full page budget on each load left no time for the policy
 * pages (review, 2026-10-25).
 */
export const IDLE_WAIT_MS = 5_000;
const CLOSE_GRACE_MS = 2_000;

export const UA_SUFFIX = 'StateCheckScan/1 (+https://statechecksecurity.com/scan)';

const LAUNCH_ARGS = [
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--disable-extensions',
  // WebRTC UDP does not go through the proxy; keep it off so it cannot reach private ranges.
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
];

export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true, args: LAUNCH_ARGS });
}

/** A normal desktop Chromium UA (not "HeadlessChrome", so tag managers behave as for a visitor) plus our suffix. */
export function userAgent(browserVersion: string): string {
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36 ${UA_SUFFIX}`;
}

export interface HardenedContextOptions {
  lookup?: Lookup;
  log: Logger;
  signal?: AbortSignal;
  /** Replaces the proxy's TCP dial. Tests always pass one so no packet leaves the machine. */
  dial?: Dial;
  /**
   * Registers routes that run *after* the route guard lets a request through.
   * Tests use it to fulfil requests from fixtures; production leaves it unset
   * and allowed requests go out through the egress proxy.
   */
  install?: (context: BrowserContext) => Promise<void>;
}

export interface HardenedContext {
  context: BrowserContext;
  blocked: BlockedRequest[];
}

export async function newHardenedContext(browser: Browser, opts: HardenedContextOptions): Promise<HardenedContext> {
  const blocked: BlockedRequest[] = [];
  const proxy = await startEgressProxy({
    log: opts.log,
    blocked,
    ...(opts.lookup ? { lookup: opts.lookup } : {}),
    ...(opts.dial ? { dial: opts.dial } : {}),
  });
  let context: BrowserContext;
  try {
    context = await browser.newContext({
      userAgent: userAgent(browser.version()),
      acceptDownloads: false,
      serviceWorkers: 'block',
      permissions: [],
      viewport: { width: 1366, height: 768 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      // Explicit, so loopback never bypasses the proxy whatever Playwright's default becomes.
      proxy: { server: proxy.server, bypass: '<-loopback>' },
    });
  } catch (err) {
    await proxy.close();
    throw err;
  }
  context.on('close', () => {
    void proxy.close();
  });

  if (opts.install) await opts.install(context);

  // Resolution cache for the route layer; the proxy keeps its own and dials what it validated.
  const resolved = new Map<string, Promise<string[]>>();
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (await allowedAddress(url, resolved, opts.lookup)) return route.fallback();
    blocked.push({ host: url.hostname, reason: 'ssrf' });
    opts.log('request-blocked', { host: url.hostname, reason: 'ssrf', layer: 'route' });
    return route.abort('blockedbyclient');
  });

  if (opts.signal) {
    const onAbort = (): void => {
      // Closing aborts every in-flight navigation; the orchestrator reports the scan as partial.
      context.close().catch(() => undefined);
    };
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  return { context, blocked };
}

export type LoadOutcome =
  | { status: 'loaded'; httpStatus?: number; settled: boolean }
  | { status: 'bot-wall'; httpStatus: number }
  | { status: 'blocked'; reason: BlockedRequest['reason'] }
  | { status: 'timeout' | 'error'; httpStatus?: number };

function redirectHops(request: Request): number {
  let hops = 0;
  for (let r = request.redirectedFrom(); r; r = r.redirectedFrom()) hops += 1;
  return hops;
}

const BOT_WALL_STATUSES = new Set([403, 429, 503]);
const BOT_WALL_TITLE =
  /just a moment|attention required|access denied|access to this page has been denied|pardon our interruption/i;
const TITLE_TIMEOUT_MS = 2_000;

/**
 * A challenge page from a bot-protection service (plan section 4): a 403/429/503
 * with Cloudflare's `cf-mitigated: challenge`, a DataDome header, or a known
 * challenge title (Cloudflare, Akamai, PerimeterX, Imperva). We report it and
 * stop; we never retry around it.
 */
export function isBotWall(httpStatus: number, headers: Record<string, string>, title: string): boolean {
  if (!BOT_WALL_STATUSES.has(httpStatus)) return false;
  return headers['cf-mitigated'] === 'challenge' || 'x-datadome' in headers || BOT_WALL_TITLE.test(title);
}

/**
 * Load a page once within `timeoutMs`: wait for `load`, then for network idle
 * for up to IDLE_WAIT_MS of whatever time is left. A page that never goes idle
 * (polling SPAs, chat widgets) still counts as loaded, with `settled: false`. We never reload, because a second
 * load would double every tracker request the capture records.
 *
 * Pass the context's `blocked` list so a navigation the guard refused is
 * reported as `blocked` rather than `error`. A chain of more than
 * MAX_REDIRECTS redirects is reported as `blocked` too: Chromium has already
 * followed it (every hop was checked by the proxy), but we do not use the page.
 * A bot-protection challenge is reported as `bot-wall` and not waited on.
 */
export async function loadPage(
  page: Page,
  url: string,
  opts: { timeoutMs?: number; blocked?: BlockedRequest[] } = {},
): Promise<LoadOutcome> {
  const timeoutMs = opts.timeoutMs ?? PAGE_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  const blockedBefore = opts.blocked?.length ?? 0;
  let httpStatus: number | undefined;
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    if (response && redirectHops(response.request()) > MAX_REDIRECTS) {
      opts.blocked?.push({ host: new URL(response.url()).hostname, reason: 'redirects' });
      return { status: 'blocked', reason: 'redirects' };
    }
    httpStatus = response?.status();
    if (response && httpStatus !== undefined && BOT_WALL_STATUSES.has(httpStatus)) {
      const title = await withTimeout(
        page.title().catch(() => ''),
        TITLE_TIMEOUT_MS,
        () => '',
      );
      if (isBotWall(httpStatus, response.headers(), title)) return { status: 'bot-wall', httpStatus };
    }
  } catch (err) {
    if (isTimeout(err)) return { status: 'timeout' };
    const refusal = opts.blocked?.slice(blockedBefore)[0];
    return refusal ? { status: 'blocked', reason: refusal.reason } : { status: 'error' };
  }
  const withStatus = httpStatus === undefined ? {} : { httpStatus };
  const remaining = Math.min(deadline - Date.now(), IDLE_WAIT_MS);
  if (remaining <= 0) return { status: 'loaded', ...withStatus, settled: false };
  try {
    await page.waitForLoadState('networkidle', { timeout: remaining });
    return { status: 'loaded', ...withStatus, settled: true };
  } catch {
    return { status: 'loaded', ...withStatus, settled: false };
  }
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.name === 'TimeoutError';
}

/**
 * Run `fn(arg)` inside a page or frame. Use this, not `evaluate(fn, arg)`, for any in-page function
 * with named inner functions: tsx (the CLI) compiles with esbuild's keepNames, which wraps them in a
 * `__name` helper that exists in Node but not in the page, so the call throws there ("__name is not
 * defined") while vitest, which does not add it, passes. Found 2026-10-25 (WS-4b): until then the
 * capture's storage read failed quietly in every CLI scan. `arg` must be JSON.
 */
export function evaluateIn<A, R>(target: Page | Frame, fn: (arg: A) => R, arg: A): Promise<Awaited<R>> {
  return target.evaluate<Awaited<R>>(
    `(() => { const __name = (f) => f; return (${fn.toString()})(${JSON.stringify(arg)}); })()`,
  );
}

/** Resolve with the promise, or call `onTimeout` and resolve with its value after `ms`. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Close the browser, giving up after 2 s. Playwright kills browsers it
 * launched when the Node process exits, so a hung close is cleaned up by the
 * CLI exiting; the hosted worker (WS-10) will run each scan in its own process.
 */
export async function killBrowser(browser: Browser, log: Logger): Promise<void> {
  const closed = await withTimeout(
    browser.close().then(() => true),
    CLOSE_GRACE_MS,
    () => false,
  );
  if (!closed) log('browser-close-timeout', { graceMs: CLOSE_GRACE_MS });
}
