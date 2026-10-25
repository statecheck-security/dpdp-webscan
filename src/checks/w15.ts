/**
 * W15: no mention of complaining to the Data Protection Board found (plan
 * 2.2, S.5(1)(iii), Rule 3(c)(iii)).
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { absence, PUBLISHED } from './published.js';

export function detectW15(ctx: CheckContext): Finding | undefined {
  return absence(ctx, 'W15', PUBLISHED.W15);
}
