/**
 * W2: identifiers set before any interaction (plan 2.2, section 10). Cookie
 * names and storage keys in the baseline snapshot, never values. First-party
 * session, CSRF, load-balancer and consent-state names (BENIGN_IDENTIFIERS)
 * are left out; third-party identifiers always count.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { identifiersIn } from './evidence.js';

export function detectW2(ctx: CheckContext): Finding | undefined {
  const identifiers = identifiersIn(ctx.baseline);
  if (identifiers.length === 0) return undefined;
  return { id: 'W2', evidence: { identifiers } };
}
