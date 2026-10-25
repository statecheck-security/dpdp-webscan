/**
 * W6: a consent box on a form is ticked before the visitor touches it (plan
 * 2.2, WS-4c). Any form counts, personal or not: a box the site ticked is not
 * the visitor's action. Evidence: the first such form (the box's name is in
 * its fields); the label stays out of the result (ground rule 3).
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { formEvidence } from './evidence.js';

export function detectW6(ctx: CheckContext): Finding | undefined {
  const form = ctx.forms.find((f) => f.checkboxes.some((c) => c.checked && c.consentLike));
  return form ? { id: 'W6', evidence: { form: formEvidence(form) } } : undefined;
}
