/**
 * Assembles the ScanResult (WS-3e minimal; WS-5b adds the info items and
 * `assertRedacted`). Findings are sorted by check id so results diff cleanly.
 */

import { CATALOGUE_VERSION, CHECK_IDS } from './checks.js';
import { ENGINE_VERSION, PARTIAL_REASONS } from './types.js';
import type { Finding, Info, PageVisit, PartialReason, ScanResult } from './types.js';

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
    info: parts.info,
  };
}
