/**
 * W13: no means to make rights requests found (plan 2.2, Rule 14(1)(a),
 * S.11–14): wording about asking for access, correction or erasure,
 * exercising rights, or nominating someone. Withdrawing consent is W16's.
 */

import { RIGHTS_MEANS } from '../data/keywords.js';
import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { absence, matchesAny } from './published.js';

export function detectW13(ctx: CheckContext): Finding | undefined {
  return absence(ctx, 'W13', (p) => matchesAny(RIGHTS_MEANS, p.text.text));
}
