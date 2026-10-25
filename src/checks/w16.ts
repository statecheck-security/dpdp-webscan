/**
 * W16: no explanation of how to withdraw consent found (plan 2.2,
 * S.5(1)(ii), S.6(4), Rule 3(c)(i)): a sentence that mentions withdrawing
 * consent and a way to do it (email, a link, settings, a form …), or a table
 * row that does (a rights table puts the right and the how in neighbouring
 * cells).
 */

import { WITHDRAW_CONSENT, WITHDRAW_HOW } from '../data/keywords.js';
import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { absence, sentences, tableRows } from './published.js';

export function detectW16(ctx: CheckContext): Finding | undefined {
  const explains = (s: string): boolean => WITHDRAW_CONSENT.test(s) && WITHDRAW_HOW.test(s);
  return absence(ctx, 'W16', (p) => sentences(p.text.text).some(explains) || tableRows(p.text.text).some(explains));
}
