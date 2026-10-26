/**
 * Scan orchestration (WS-3e): sequences the steps and builds the CheckContext.
 * No detection logic lives here (CLAUDE.md, decision 7); every "is this a
 * tracker / banner / form" question belongs to the module that owns it.
 *
 *  1. Baseline context: load the target, re-base on the site it landed on if
 *     it redirected to another domain, snapshot before any interaction,
 *     find the banner (no click), inspect the page, read robots.txt (after
 *     the snapshot, so it is not part of the first load), then choose up to
 *     4 extra pages: policy pages first, likely form pages and other links in
 *     the free slots (WS-3g).
 *  2. If a banner was found: a fresh context, mark, click reject, wait,
 *     snapshot what happened after the click.
 *  3. Extra pages in the baseline context (no clicks there), robots.txt honoured.
 *  4. If a banner was found: the same for accept. Last, because no check reads
 *     it yet; before the extra pages, it took the budget the policy pages need
 *     (review, 2026-10-25).
 *  5. Checks, then the result.
 *
 * Budget: 20 s per page and 90 s per scan; each page gets what is left of the
 * scan budget, capped at 20 s. Anything that times out or is blocked is
 * reported as partial with a reason, never thrown away.
 * Never submit a form. The only clicks are on consent-banner controls.
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import * as banner from './banner.js';
import type { BannerInfo, ClickBanner, ClickOutcome, FindBanner, FindPersistentControl } from './banner.js';
import { killBrowser, launchBrowser, loadPage, newHardenedContext, PAGE_TIMEOUT_MS, withTimeout } from './browser.js';
import type { BlockedRequest, HardenedContextOptions, LoadOutcome } from './browser.js';
import { attachCapture } from './capture.js';
import type { CaptureSnapshot, SnapshotLabel } from './capture.js';
import type { CheckContext, TrackerLookup } from './checks/context.js';
import { runChecks } from './checks/index.js';
import { buildInfo } from './checks/info.js';
import type { CmpFrame } from './data/cmps.js';
import { categorise } from './data/trackers.js';
import { inspectForms } from './forms.js';
import type { FormInfo, InspectForms } from './forms.js';
import { parseTarget } from './guard.js';
import type { Lookup } from './guard.js';
import { log as defaultLog } from './log.js';
import type { Logger } from './log.js';
import {
  contextRobotsFetcher,
  discoverPages,
  landedSite,
  MAX_EXTRA_PAGES,
  registrableDomain,
  robotsPolicy,
} from './pages.js';
import type { FetchRobots, RobotsFetch } from './pages.js';
import { assertRedacted, buildResult } from './result.js';
import { extractText } from './text.js';
import type { ExtractText, PageText } from './text.js';
import type { PageReason, PageStatus, PageVisit, PartialReason, ScanResult } from './types.js';
import { pageUrlOfString } from './urls.js';

export const SCAN_TIMEOUT_MS = 90_000;
export const MAX_PAGES = 1 + MAX_EXTRA_PAGES;
/** Kept back at the end of the scan budget to close contexts and assemble the result. */
const RESERVE_MS = 2_000;
/** After a banner click, how long we let what it triggers fire (plan WS-3e step 2). */
const AFTER_CLICK_MS = 5_000;
/** Cap on any single inspector call, so one hung page script cannot eat the scan budget. */
const INSPECTOR_TIMEOUT_MS = 10_000;

/** The per-page steps owned by banner.ts, forms.ts and text.ts. */
export interface PageInspectors {
  findBanner: FindBanner;
  clickReject: ClickBanner;
  clickAccept: ClickBanner;
  findPersistentControl: FindPersistentControl;
  inspectForms: InspectForms;
  extractText: ExtractText;
}

const DEFAULT_INSPECTORS: PageInspectors = {
  findBanner: banner.findBanner,
  clickReject: banner.clickReject,
  clickAccept: banner.clickAccept,
  findPersistentControl: banner.findPersistentControl,
  inspectForms,
  extractText,
};

export interface ScanOptions {
  lookup?: Lookup;
  /** A browser to reuse; runScan does not close it. Without one, a browser is launched and killed. */
  browser?: Browser;
  /** Defaults to reading robots.txt through the baseline context (plan decision 17). */
  fetchRobots?: FetchRobots;
  now?: () => Date;
  log?: Logger;
  signal?: AbortSignal;
  /** Defaults to SCAN_TIMEOUT_MS. Tests shorten it. */
  scanTimeoutMs?: number;
  /** Defaults to AFTER_CLICK_MS. Tests shorten it: fixture banners fire at once. */
  afterClickMs?: number;
  /** Defaults to BANNER_WAIT_MS (banner.ts). Tests shorten it: most fixture banners are in the HTML. */
  bannerWaitMs?: number;
  /** Tests: allow the fixture CMP's frame domain. Defaults to CMP_FRAMES (src/data/cmps.ts). */
  cmpFrames?: readonly CmpFrame[];
  /** Tests: fixture routing and a fake dial for every context (test/fixtures.ts). */
  contextOptions?: Pick<HardenedContextOptions, 'install' | 'dial'>;
  /** Tests: replace per-page inspectors (e.g. a fake banner before WS-4b exists). */
  inspectors?: Partial<PageInspectors>;
  /** Tests: categorise the fixture hosts. Defaults to the hand-kept list (src/data/trackers.ts). */
  trackers?: TrackerLookup;
}

/** Everything a scan saw, before checks run. */
export interface ScanCollection {
  target: URL;
  registrableDomain: string;
  startedAt: Date;
  pages: PageVisit[];
  partialReasons: PartialReason[];
  baseline: CaptureSnapshot;
  afterReject?: CaptureSnapshot;
  afterAccept?: CaptureSnapshot;
  /** The baseline context after the extra pages; requests carry the page they came from. */
  allPages?: CaptureSnapshot;
  banner?: BannerInfo;
  /** Clicks the reject run needed (2 when reject sat behind a settings layer). */
  rejectClicks?: number;
  persistentControlFoundOn: string[];
  forms: FormInfo[];
  texts: Map<string, PageText>;
  /** The extra pages chosen for the scan, recorded like page URLs; coverage lists those never loaded (WS-11i). */
  plannedPages: { url: string; reason: PageReason }[];
  /** Page URL → Referrer-Policy header, for pages that sent one (W11, WS-11g). */
  referrerHeaders: Map<string, string>;
}

const STATUS: Record<LoadOutcome['status'], PageStatus> = {
  loaded: 'loaded',
  'bot-wall': 'blocked-bot-wall',
  blocked: 'blocked-ssrf',
  timeout: 'timeout',
  error: 'error',
};

function partialReasonFor(outcome: LoadOutcome): PartialReason | undefined {
  switch (outcome.status) {
    case 'loaded':
      return undefined;
    case 'bot-wall':
      return 'bot-wall';
    case 'blocked':
      return outcome.reason === 'ssrf' ? 'ssrf-blocked' : 'navigation-error';
    case 'timeout':
      return 'page-timeout';
    case 'error':
      return 'navigation-error';
  }
}

function emptySnapshot(label: SnapshotLabel, at: Date): CaptureSnapshot {
  return { label, takenAt: at.toISOString(), requests: [], requestsDropped: 0, cookies: [], storage: [] };
}

interface OpenContext {
  context: BrowserContext;
  blocked: BlockedRequest[];
  page: Page;
  capture: ReturnType<typeof attachCapture>;
}

export async function collectScan(target: URL, opts: ScanOptions = {}): Promise<ScanCollection> {
  // Callers check first (src/cli.ts); repeated so no other caller can skip it. Throws TargetError.
  parseTarget(target.href);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? defaultLog;
  const inspect: PageInspectors = {
    ...DEFAULT_INSPECTORS,
    ...(opts.bannerWaitMs !== undefined || opts.cmpFrames !== undefined
      ? { findBanner: banner.bannerFinder(opts.bannerWaitMs ?? banner.BANNER_WAIT_MS, opts.cmpFrames) }
      : {}),
    ...opts.inspectors,
  };
  const scanTimeoutMs = opts.scanTimeoutMs ?? SCAN_TIMEOUT_MS;
  const reserveMs = Math.min(RESERVE_MS, scanTimeoutMs / 10);
  const deadline = Date.now() + scanTimeoutMs;
  const signal = AbortSignal.any([AbortSignal.timeout(scanTimeoutMs), ...(opts.signal ? [opts.signal] : [])]);
  // The site the scan follows: the target, or where it landed (landedSite). Contexts opened later use it.
  let site = target;
  let siteDomain = registrableDomain(target.hostname);
  const reasons = new Set<PartialReason>();
  const startedAt = now();

  const collection: ScanCollection = {
    target,
    registrableDomain: siteDomain,
    startedAt,
    pages: [],
    partialReasons: [],
    baseline: emptySnapshot('baseline', startedAt),
    persistentControlFoundOn: [],
    forms: [],
    texts: new Map(),
    referrerHeaders: new Map(),
    plannedPages: [],
  };

  /** Time left for the next step, capped at one page; zero or less means stop. */
  const budget = (): number => Math.min(PAGE_TIMEOUT_MS, deadline - reserveMs - Date.now());

  /** Run an inspector within the budget; a failure or timeout gives `fallback`, logged, never thrown. */
  async function guarded<T>(step: string, run: () => Promise<T>, fallback: T): Promise<T> {
    const ms = Math.min(INSPECTOR_TIMEOUT_MS, budget());
    if (ms <= 0) return fallback;
    return withTimeout(
      run().catch(() => {
        log('step-failed', { step });
        return fallback;
      }),
      ms,
      () => {
        log('step-timeout', { step, ms });
        return fallback;
      },
    );
  }

  const browser = opts.browser ?? (await launchBrowser());
  const contexts: BrowserContext[] = [];

  async function open(): Promise<OpenContext> {
    const hardened = await newHardenedContext(browser, {
      log,
      signal,
      ...(opts.lookup ? { lookup: opts.lookup } : {}),
      ...opts.contextOptions,
    });
    contexts.push(hardened.context);
    const capture = attachCapture(hardened.context, { registrableDomain: siteDomain, blocked: hardened.blocked, now });
    const page = await hardened.context.newPage();
    return { ...hardened, page, capture };
  }

  /** Load one page and record it. Undefined when the scan budget is spent (nothing recorded). */
  async function visit(ctx: OpenContext, url: string, reason: PageReason): Promise<PageVisit | undefined> {
    const timeoutMs = budget();
    if (timeoutMs <= 0) {
      reasons.add('scan-timeout');
      return undefined;
    }
    const started = Date.now();
    const outcome = await loadPage(ctx.page, url, { blocked: ctx.blocked, timeoutMs });
    const pageVisit: PageVisit = {
      url: pageUrlOfString(url) ?? url,
      reason,
      status: STATUS[outcome.status],
      ...('httpStatus' in outcome && outcome.httpStatus !== undefined ? { httpStatus: outcome.httpStatus } : {}),
      ...(outcome.status === 'loaded' && !outcome.settled ? { settled: false as const } : {}),
    };
    collection.pages.push(pageVisit);
    if (outcome.status === 'loaded' && outcome.referrerPolicyHeader) {
      collection.referrerHeaders.set(pageVisit.url, outcome.referrerPolicyHeader);
    }
    const partial = signal.aborted ? 'scan-timeout' : partialReasonFor(outcome);
    if (partial) reasons.add(partial);
    log('page-visited', {
      reason,
      status: pageVisit.status,
      settled: outcome.status === 'loaded' && outcome.settled,
      ms: Date.now() - started,
    });
    return pageVisit;
  }

  async function inspectPage(page: Page, url: string): Promise<void> {
    collection.forms.push(...(await guarded('forms', () => inspect.inspectForms(page), [])));
    const text = await guarded('text', () => inspect.extractText(page), undefined);
    if (text) collection.texts.set(url, text);
    if (await guarded('persistent-control', () => inspect.findPersistentControl(page), false)) {
      collection.persistentControlFoundOn.push(url);
    }
  }

  /**
   * Step 2: a fresh context, the same page, one banner choice, and what fired after it. A banner
   * without that control (no reject anywhere, say) is a finding for the checks, not a partial scan.
   */
  async function interaction(
    label: SnapshotLabel,
    click: ClickBanner,
  ): Promise<{ snapshot: CaptureSnapshot; clicks: number } | undefined> {
    const timeoutMs = budget();
    if (timeoutMs <= 0) {
      reasons.add('scan-timeout');
      return undefined;
    }
    const run = await open();
    try {
      const outcome = await loadPage(run.page, target.href, { blocked: run.blocked, timeoutMs });
      if (outcome.status !== 'loaded') {
        reasons.add(partialReasonFor(outcome) ?? 'navigation-error');
        return undefined;
      }
      const found = await guarded('banner', () => inspect.findBanner(run.page), undefined);
      const mark = found ? await run.capture.mark() : undefined;
      const failed: ClickOutcome = { clicked: false, reason: 'failed' };
      const choice = found ? await guarded(label, () => click(run.page, found), failed) : failed;
      if (!found || !mark || !choice.clicked) {
        // Seen on the baseline load but not found or clickable this time (a missing control is not that).
        if (!choice.clicked && choice.reason === 'failed') reasons.add('banner-not-found');
        return undefined;
      }
      const waitMs = Math.min(opts.afterClickMs ?? AFTER_CLICK_MS, budget());
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      return { snapshot: await run.capture.snapshot(label, mark), clicks: choice.clicks };
    } finally {
      run.capture.detach();
      await run.context.close().catch(() => undefined);
    }
  }

  try {
    // Step 1: baseline.
    const base = await open();
    const first = await visit(base, target.href, 'requested');
    const landed = first?.status === 'loaded' ? landedSite(base.page.url(), target) : undefined;
    if (landed) {
      log('site-rebased', { from: siteDomain, to: registrableDomain(landed.hostname) });
      site = landed;
      siteDomain = registrableDomain(landed.hostname);
      collection.registrableDomain = siteDomain;
      base.capture.rebase(siteDomain);
    }
    collection.baseline = await base.capture.snapshot('baseline');
    if (!first || first.status !== 'loaded') return collection;

    const found = await guarded('banner', () => inspect.findBanner(base.page), undefined);
    if (found) collection.banner = found;
    await inspectPage(base.page, first.url);
    // robots.txt before choosing pages, so a disallowed page never takes a free slot (WS-3g).
    const fetchRobots =
      opts.fetchRobots ??
      contextRobotsFetcher(base.context, { blocked: base.blocked, exclude: (page) => base.capture.exclude(page) });
    const unreachable: RobotsFetch = { status: 'unreachable' };
    const robots = robotsPolicy(await guarded('robots', () => fetchRobots(site.origin), unreachable));
    const chosen = await guarded('discover', () => discoverPages(base.page, site, robots), []);
    collection.plannedPages = chosen.map((p) => ({ url: pageUrlOfString(p.url) ?? p.url, reason: p.reason }));

    // Step 2: reject, in its own fresh context.
    if (collection.banner) {
      const afterReject = await interaction('after-reject', inspect.clickReject);
      if (afterReject) {
        collection.afterReject = afterReject.snapshot;
        collection.rejectClicks = afterReject.clicks;
      }
    }

    // Step 3: extra pages, in the baseline context (no clicks happen there).
    for (const page of chosen) {
      if (!robots(new URL(page.url))) {
        collection.pages.push({ url: page.url, reason: page.reason, status: 'skipped-robots' });
        continue;
      }
      const pageVisit = await visit(base, page.url, page.reason);
      if (!pageVisit) break;
      if (pageVisit.status === 'loaded') await inspectPage(base.page, pageVisit.url);
    }
    collection.allPages = await base.capture.snapshot('all-pages');

    // Step 4: accept, in its own fresh context.
    if (collection.banner) {
      const afterAccept = await interaction('after-accept', inspect.clickAccept);
      if (afterAccept) collection.afterAccept = afterAccept.snapshot;
    }
    return collection;
  } catch (err) {
    // Contexts closed by the scan timeout make later steps throw; report what we have.
    if (!signal.aborted) throw err;
    reasons.add('scan-timeout');
    return collection;
  } finally {
    collection.partialReasons = [...reasons];
    await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
    if (!opts.browser) await killBrowser(browser, log);
    log('scan-collected', { pages: collection.pages.length, partial: reasons.size > 0 });
  }
}

function checkContext(collection: ScanCollection, trackers: TrackerLookup): CheckContext {
  return {
    target: collection.target,
    registrableDomain: collection.registrableDomain,
    pages: collection.pages,
    baseline: collection.baseline,
    ...(collection.afterReject ? { afterReject: collection.afterReject } : {}),
    ...(collection.afterAccept ? { afterAccept: collection.afterAccept } : {}),
    ...(collection.allPages ? { allPages: collection.allPages } : {}),
    ...(collection.banner ? { banner: collection.banner } : {}),
    ...(collection.rejectClicks !== undefined ? { rejectClicks: collection.rejectClicks } : {}),
    persistentControlFoundOn: collection.persistentControlFoundOn,
    forms: collection.forms,
    texts: collection.texts,
    referrerHeaders: collection.referrerHeaders,
    plannedPages: collection.plannedPages,
    trackers,
  };
}

export async function runScan(target: URL, opts: ScanOptions = {}): Promise<ScanResult> {
  const now = opts.now ?? (() => new Date());
  const collection = await collectScan(target, opts);
  const ctx = checkContext(collection, opts.trackers ?? categorise);
  const result = buildResult({
    target,
    startedAt: collection.startedAt,
    finishedAt: now(),
    pages: collection.pages,
    partialReasons: collection.partialReasons,
    findings: runChecks(ctx),
    info: buildInfo(ctx),
  });
  // No caller (CLI, scan:send, the WS-10 worker) can get a result that is not redacted.
  assertRedacted(result);
  return result;
}
