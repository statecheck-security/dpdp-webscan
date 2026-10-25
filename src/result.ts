/**
 * Assembles the ScanResult and asserts it is redacted (WS-3e, WS-5b).
 * Findings are sorted by check id and info items by INFO_IDS, so results
 * diff cleanly. Info items are built by src/checks/info.ts.
 *
 * `assertRedacted` is the exit-side half of CLAUDE.md decision 5: capture,
 * forms and text never read values, and this walk refuses any result that
 * still holds something value-shaped. runScan calls it on every result it
 * returns, and scan:send again before sending one.
 */

import { CATALOGUE_VERSION, CHECK_IDS, INFO_IDS } from './checks.js';
import { ENGINE_VERSION, PARTIAL_REASONS } from './types.js';
import type { Finding, Info, PageVisit, PartialReason, ScanResult } from './types.js';
import { VALUE_TOKEN } from './urls.js';

export interface ResultParts {
  target: URL;
  startedAt: Date;
  finishedAt: Date;
  pages: PageVisit[];
  partialReasons: Iterable<PartialReason>;
  findings: Finding[];
  info: Info[];
}

export function buildResult(parts: ResultParts): ScanResult {
  const reasons = new Set(parts.partialReasons);
  return {
    engineVersion: ENGINE_VERSION,
    catalogueVersion: CATALOGUE_VERSION,
    target: parts.target.href,
    startedAt: parts.startedAt.toISOString(),
    finishedAt: parts.finishedAt.toISOString(),
    partial: reasons.size > 0,
    // Fixed order, so the same scan always serialises the same way.
    partialReasons: PARTIAL_REASONS.filter((r) => reasons.has(r)),
    pages: parts.pages,
    findings: [...parts.findings].sort((a, b) => CHECK_IDS.indexOf(a.id) - CHECK_IDS.indexOf(b.id)),
    info: [...parts.info].sort((a, b) => INFO_IDS.indexOf(a.id) - INFO_IDS.indexOf(b.id)),
  };
}

/** Longest string a result may hold; the longest legitimate one is a page URL or a 25-word quote. */
const MAX_STRING_CHARS = 400;
const EMAIL = /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i;
/** Keys that hold page URLs, where an `@` can be part of a path (`/@handle`). */
const URL_KEYS = new Set(['target', 'url', 'pageUrl', 'pagesSearched', 'foundOn']);
/** Ground rule 1, on keys: no score-like field, whatever its casing. */
const SCORE_KEY = /score|grade|severity|rating|percent|compliant/i; // no-score-enforcer

export type RedactionCode = 'string-too-long' | 'value-token' | 'email' | 'forbidden-key';

/** Names the JSON path of the offending field, never its content. */
export class RedactionError extends Error {
  constructor(
    readonly code: RedactionCode,
    readonly path: string,
  ) {
    super(`Result not redacted (${code}) at ${path}`);
    this.name = 'RedactionError';
  }
}

function walk(value: unknown, path: string, key: string | undefined): void {
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_CHARS) throw new RedactionError('string-too-long', path);
    if (VALUE_TOKEN.test(value)) throw new RedactionError('value-token', path);
    if (!(key !== undefined && URL_KEYS.has(key)) && EMAIL.test(value)) throw new RedactionError('email', path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, key));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SCORE_KEY.test(k)) throw new RedactionError('forbidden-key', `${path}.${k}`);
      walk(v, `${path}.${k}`, k);
    }
  }
}

/** Throws RedactionError on the first value-shaped string or score-like key. */
export function assertRedacted(result: ScanResult): void {
  walk(result, '$', undefined);
}
