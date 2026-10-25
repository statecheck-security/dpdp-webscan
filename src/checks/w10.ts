/**
 * W10: a personal-data form on a plain-http page, or one that submits over
 * plain http (plan 2.2, WS-4c).
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { formEvidence, isPersonalForm } from './evidence.js';

export function detectW10(ctx: CheckContext): Finding | undefined {
  const form = ctx.forms.find((f) => isPersonalForm(f) && (f.pageUrl.startsWith('http:') || f.actionScheme === 'http'));
  return form ? { id: 'W10', evidence: { form: formEvidence(form) } } : undefined;
}
