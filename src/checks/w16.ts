/**
 * W16: no explanation of how to withdraw consent found (plan 2.2,
 * S.5(1)(ii), S.6(4), Rule 3(c)(i)): a sentence that mentions withdrawing
 * consent and a way to do it (email, a link, settings, a form …), or a table
 * row that does (a rights table puts the right and the how in neighbouring
 * cells).
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { absence, PUBLISHED } from './published.js';

export function detectW16(ctx: CheckContext): Finding | undefined {
  return absence(ctx, 'W16', PUBLISHED.W16);
}
