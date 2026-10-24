/**
 * W3: trackers still fire after "reject" (plan 2.2, section 10). Reads the
 * reject run only, and only what happened after the click (capture mark,
 * decision 16): tracker hosts contacted, and identifiers set since the mark
 * (the CMP's own consent-state cookies are left out, BENIGN_IDENTIFIERS).
 * No reject run (no banner, no reject control) means no W3.
 */

import { isTracking } from '../data/trackers.js';
import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { identifiersIn, trackerRequests } from './evidence.js';

export function detectW3(ctx: CheckContext): Finding | undefined {
  if (!ctx.afterReject) return undefined;
  const thirdParties = trackerRequests(ctx.afterReject, ctx.trackers).filter((r) => isTracking(r.category));
  const identifiers = identifiersIn(ctx.afterReject, { sinceMarkOnly: true });
  if (thirdParties.length === 0 && identifiers.length === 0) return undefined;
  return {
    id: 'W3',
    evidence: {
      ...(thirdParties.length > 0 ? { thirdParties } : {}),
      ...(identifiers.length > 0 ? { identifiers } : {}),
    },
  };
}
