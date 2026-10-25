/**
 * Which pages a scan visits (WS-3c, WS-3d): same-site rules (registrable
 * domain from the hand-kept list in src/data/suffixes.ts, plan section 4),
 * choosing the up to 4 extra pages by link text (policy pages first, then
 * likely form pages and other links in the free slots, WS-3g), and robots.txt.
 *
 * robots.txt is honoured for the extra pages only; the requested URL is always
 * loaded, as a visitor would (plan section 4). It is fetched through the
 * hardened context like any page, never with Node's fetch, which would bypass
 * the egress proxy (decision 17).
 */

import { isIP } from 'node:net';
import type { BrowserContext, Page } from 'playwright';
import { loadPage, PAGE_TIMEOUT_MS, withTimeout } from './browser.js';
import type { BlockedRequest } from './browser.js';
import { FORM_PAGE_LINKS, PAGE_LINKS, SKIPPED_PAGE_PATHS } from './data/keywords.js';
import { PUBLIC_SUFFIXES } from './data/suffixes.js';
import { parseTarget } from './guard.js';
import type { PageReason } from './types.js';

/** Extra pages after the requested one (MAX_PAGES = 5 in total). */
export const MAX_EXTRA_PAGES = 4;
const MAX_LINKS = 2_000;
const MAX_LINK_TEXT = 100;
const LINK_READ_TIMEOUT_MS = 5_000;
/** RFC 9309 lets a crawler stop parsing after 500 KiB. */
const MAX_ROBOTS_CHARS = 500 * 1024;
export const ROBOTS_AGENT = 'StateCheckScan';

function normaliseHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/^\.+|\.+$/g, '');
}

/**
 * The registrable domain of a host: the longest known public suffix plus one
 * label, or the last two labels when no listed suffix matches. IP literals and
 * single-label hosts are returned as they are.
 */
export function registrableDomain(host: string): string {
  const name = normaliseHost(host);
  if (isIP(name) !== 0) return name;
  const labels = name.split('.');
  // The smallest index is the longest suffix, so the first match wins.
  for (let i = 1; i < labels.length; i += 1) {
    if (PUBLIC_SUFFIXES.has(labels.slice(i).join('.'))) return labels.slice(i - 1).join('.');
  }
  return labels.slice(-2).join('.');
}

/** True when `url` is http(s) on the same registrable domain as `target`. */
export function sameSite(url: URL, target: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return registrableDomain(url.hostname) === registrableDomain(target.hostname);
}

/**
 * Where the scan really is after the requested page loaded: the final URL, when the requested one
 * redirected to another registrable domain (`brand.in` → `brand.com`), else undefined. Page discovery,
 * robots.txt and first/third party then follow the site a visitor lands on; with the typed domain,
 * no link would be same-site and the site's own cookies would count as third party (review,
 * 2026-10-25). The final URL was already allowed by the egress proxy; parseTarget is repeated so a
 * landing URL is held to the same rules as a requested one.
 */
export function landedSite(finalHref: string, target: URL): URL | undefined {
  let landed: URL;
  try {
    landed = parseTarget(finalHref);
  } catch {
    return undefined;
  }
  return registrableDomain(landed.hostname) === registrableDomain(target.hostname) ? undefined : landed;
}

// --- Page discovery (WS-3d) ---

export interface PageLink {
  /** Absolute URL, as the browser resolved it. */
  href: string;
  /** Visible text, or aria-label / title; collapsed and capped. Used for matching only, never stored. */
  text: string;
}

export interface ChosenPage {
  url: string;
  reason: Exclude<PageReason, 'requested'>;
}

/** Origin and path only: fragments are the same page, and query strings can carry identifiers. */
function pageKey(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

/** The key for duplicates: scheme dropped and `www.` folded into the bare host. */
function sameKey(url: URL): string {
  return `${url.hostname.replace(/^www\./, '')}${url.port ? `:${url.port}` : ''}${url.pathname}`;
}

/**
 * Choose up to MAX_EXTRA_PAGES same-site pages.
 *  1. Policy pages, at most one per reason, in the order of PAGE_LINKS
 *     (privacy → cookies → contact → grievance → terms). Link text wins over
 *     a path match; within each, document order decides. A policy page
 *     robots.txt disallows still takes its slot (the scan records it as
 *     `skipped-robots`, so the report says why it was not checked).
 *  2. Free slots (WS-3g): links that look like a form page (`form`), then any
 *     other link (`other`), in document order, skipping files, account pages
 *     and pages robots.txt disallows (`allowed`).
 */
export function pickPages(
  links: readonly PageLink[],
  target: URL,
  allowed: (url: URL) => boolean = () => true,
): ChosenPage[] {
  const targetSame = sameKey(target);
  const candidates: { key: string; path: string; text: string; url: URL }[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (!sameSite(url, target)) continue;
    const key = pageKey(url);
    // `www.` and the bare host serve the same page on almost every site; count them once.
    const same = sameKey(url);
    if (same === targetSame || seen.has(same)) continue;
    seen.add(same);
    candidates.push({ key, path: url.pathname, text: link.text, url });
  }

  const chosen: ChosenPage[] = [];
  const used = new Set<string>();
  for (const { reason, text, path } of PAGE_LINKS) {
    if (chosen.length >= MAX_EXTRA_PAGES) break;
    const free = candidates.filter((c) => !used.has(c.key));
    const match = free.find((c) => text.test(c.text)) ?? free.find((c) => path.test(c.path));
    if (!match) continue;
    used.add(match.key);
    chosen.push({ url: match.key, reason });
  }

  const fillers = candidates.filter(
    (c) => !used.has(c.key) && !SKIPPED_PAGE_PATHS.some((re) => re.test(c.path)) && allowed(c.url),
  );
  const formLike = fillers.filter((c) => FORM_PAGE_LINKS.text.test(c.text) || FORM_PAGE_LINKS.path.test(c.path));
  const rest = fillers.filter((c) => !formLike.includes(c));
  for (const [list, reason] of [
    [formLike, 'form'],
    [rest, 'other'],
  ] as const) {
    for (const c of list) {
      if (chosen.length >= MAX_EXTRA_PAGES) return chosen;
      chosen.push({ url: c.key, reason });
    }
  }
  return chosen;
}

/** Read the page's links (href and label only) and choose the extra pages; `allowed` is the robots.txt policy. */
export async function discoverPages(
  page: Page,
  target: URL,
  allowed: (url: URL) => boolean = () => true,
): Promise<ChosenPage[]> {
  const links = await withTimeout(
    page
      .$$eval(
        'a[href]',
        (anchors, { maxLinks, maxText }) =>
          anchors.slice(0, maxLinks).map((a) => {
            const el = a as HTMLAnchorElement;
            const label = el.innerText || el.getAttribute('aria-label') || el.title || '';
            return { href: el.href, text: label.replace(/\s+/g, ' ').trim().slice(0, maxText) };
          }),
        { maxLinks: MAX_LINKS, maxText: MAX_LINK_TEXT },
      )
      .catch((): PageLink[] => []),
    LINK_READ_TIMEOUT_MS,
    (): PageLink[] => [],
  );
  return pickPages(links, target, allowed);
}

// --- robots.txt (WS-3d) ---

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  /** Lower-cased product tokens from the group's User-agent lines. */
  agents: string[];
  rules: RobotsRule[];
}

/** Parse robots.txt into groups (RFC 9309). Unknown lines (Sitemap, Crawl-delay, …) are ignored. */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let inAgentLines = false;
  for (const raw of text.slice(0, MAX_ROBOTS_CHARS).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      // Consecutive User-agent lines share one group; one after a rule starts a new group.
      if (!current || !inAgentLines) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgentLines = true;
    } else if (field === 'allow' || field === 'disallow') {
      inAgentLines = false;
      // An empty Disallow allows everything: no rule needed.
      if (current && value !== '') current.rules.push({ allow: field === 'allow', pattern: value });
    }
  }
  return groups;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path);
}

/**
 * Whether `path` (path plus query) may be fetched by `agent`. The group naming
 * the agent wins over `*`; the longest matching pattern decides, and Allow wins
 * a tie. No group or no matching rule means allowed.
 */
export function robotsAllows(groups: readonly RobotsGroup[], path: string, agent = ROBOTS_AGENT): boolean {
  const token = agent.toLowerCase();
  const own = groups.filter((g) => g.agents.includes(token));
  const applicable = own.length > 0 ? own : groups.filter((g) => g.agents.includes('*'));
  let best: RobotsRule | undefined;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (!matches(rule.pattern, path)) continue;
    const longer = !best || rule.pattern.length > best.pattern.length;
    const tieAllow = best !== undefined && rule.pattern.length === best.pattern.length && rule.allow;
    if (longer || tieAllow) best = rule;
  }
  return best?.allow ?? true;
}

/**
 * What fetching robots.txt gave us. RFC 9309: a 4xx means there are no rules;
 * a 5xx or a failed fetch means the crawler must assume everything is disallowed.
 */
export type RobotsFetch = { status: 'found'; text: string } | { status: 'absent' } | { status: 'unreachable' };

export type FetchRobots = (origin: string) => Promise<RobotsFetch>;

/** Turn a fetch outcome into a per-URL policy for the extra pages. */
export function robotsPolicy(fetched: RobotsFetch): (url: URL) => boolean {
  if (fetched.status === 'absent') return () => true;
  if (fetched.status === 'unreachable') return () => false;
  const groups = parseRobots(fetched.text);
  return (url) => robotsAllows(groups, `${url.pathname}${url.search}`);
}

/**
 * The production FetchRobots: loads `<origin>/robots.txt` in a new page of an
 * existing hardened context, so both SSRF layers apply. Call it after the
 * baseline snapshot, so the request is not counted as part of the first load.
 */
export function contextRobotsFetcher(
  context: BrowserContext,
  opts: { blocked: BlockedRequest[]; timeoutMs?: number },
): FetchRobots {
  return async (origin) => {
    const page = await context.newPage();
    try {
      const outcome = await loadPage(page, `${origin}/robots.txt`, {
        blocked: opts.blocked,
        timeoutMs: opts.timeoutMs ?? PAGE_TIMEOUT_MS,
      });
      if (outcome.status !== 'loaded' || outcome.httpStatus === undefined) return { status: 'unreachable' };
      if (outcome.httpStatus >= 500) return { status: 'unreachable' };
      if (outcome.httpStatus >= 400) return { status: 'absent' };
      if (outcome.httpStatus >= 300) return { status: 'unreachable' };
      const doc = await withTimeout(
        page
          .evaluate(() => ({ type: document.contentType, body: document.body?.innerText ?? '' }))
          .catch(() => undefined),
        LINK_READ_TIMEOUT_MS,
        () => undefined,
      );
      if (!doc) return { status: 'unreachable' };
      // An HTML page served at /robots.txt (common on catch-all routes) holds no rules.
      if (doc.type !== 'text/plain') return { status: 'absent' };
      return { status: 'found', text: doc.body.slice(0, MAX_ROBOTS_CHARS) };
    } finally {
      await page.close().catch(() => undefined);
    }
  };
}
