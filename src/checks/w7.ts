/**
 * W7: no visible way to change or withdraw consent later (plan 2.2, WS-4b).
 * Emitted only when a banner was seen (without one, the `banner` info item
 * carries it) and no scanned page had a persistent control outside the
 * banner. Evidence: the pages we searched.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';

export function detectW7(ctx: CheckContext): Finding | undefined {
  if (!ctx.banner || ctx.persistentControlFoundOn.length > 0) return undefined;
  const pagesSearched = ctx.pages.filter((p) => p.status === 'loaded').map((p) => p.url);
  return { id: 'W7', evidence: { pagesSearched } };
}
