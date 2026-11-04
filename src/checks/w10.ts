/**
 * W10: a personal-data form on a plain-http page, or one that submits over
 * plain http (plan 2.2, WS-4c). Evidence: every such form, at most 5 (WS-11g).
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { formsEvidence, isPersonalForm } from './evidence.js';

export function detectW10(ctx: CheckContext): Finding | undefined {
  const forms = ctx.forms.filter(
    (f) => isPersonalForm(f) && (f.pageUrl.startsWith('http:') || f.actionScheme === 'http'),
  );
  return forms.length > 0 ? { id: 'W10', evidence: { forms: formsEvidence(forms) } } : undefined;
}
