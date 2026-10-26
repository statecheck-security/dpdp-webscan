/**
 * W6: a consent box on a form is ticked before the visitor touches it (plan
 * 2.2, WS-4c). Any form counts, personal or not: a box the site ticked is not
 * the visitor's action. Evidence: every such form, at most 5 (WS-11g; the
 * box's name is in its fields); the label stays out of the result (ground rule 3).
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { formsEvidence } from './evidence.js';

export function detectW6(ctx: CheckContext): Finding | undefined {
  const forms = ctx.forms.filter((f) => f.checkboxes.some((c) => c.checked && c.consentLike));
  return forms.length > 0 ? { id: 'W6', evidence: { forms: formsEvidence(forms) } } : undefined;
}
