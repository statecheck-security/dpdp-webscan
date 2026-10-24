/**
 * W1: third-party trackers load before any interaction (plan 2.2, section 10).
 * Reads the baseline snapshot only: the target page, before the banner is
 * touched. A tracker is a third-party host in TRACKING_CATEGORIES; CMPs and
 * unknown hosts never count.
 */

import { isTracking } from '../data/trackers.js';
import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { trackerRequests } from './evidence.js';

export function detectW1(ctx: CheckContext): Finding | undefined {
  const trackers = trackerRequests(ctx.baseline, ctx.trackers).filter((r) => isTracking(r.category));
  if (trackers.length === 0) return undefined;
  return { id: 'W1', evidence: { thirdParties: trackers } };
}
