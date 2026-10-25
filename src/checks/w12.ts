/**
 * W12: no contact for privacy questions found (plan 2.2, Rule 9, S.8(9)).
 * Matches a grievance or data protection officer, a privacy-style address,
 * or "contact … privacy" wording, or a mailto link on a privacy or contact
 * page. Only that it was found counts; the contact itself is never recorded.
 */

import { PRIVACY_CONTACT } from '../data/keywords.js';
import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { absence, matchesAny } from './published.js';

export function detectW12(ctx: CheckContext): Finding | undefined {
  return absence(
    ctx,
    'W12',
    (p) =>
      matchesAny(PRIVACY_CONTACT, p.text.text) ||
      (p.text.hasMailto && (p.reason === 'privacy' || p.reason === 'contact')),
  );
}
