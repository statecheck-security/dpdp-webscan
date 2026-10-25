/**
 * W15: no mention of complaining to the Data Protection Board found (plan
 * 2.2, S.5(1)(iii), Rule 3(c)(iii)).
 */

import { BOARD_COMPLAINT } from '../data/keywords.js';
import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { absence, matchesAny } from './published.js';

export function detectW15(ctx: CheckContext): Finding | undefined {
  return absence(ctx, 'W15', (p) => matchesAny(BOARD_COMPLAINT, p.text.text));
}
