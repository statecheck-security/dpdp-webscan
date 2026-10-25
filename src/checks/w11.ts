/**
 * W11: a personal-data form that sends by GET, so what the visitor types
 * lands in the URL (plan 2.2, WS-4c). Forms with neither a method nor an
 * action attribute are left out: a script almost always submits those, and
 * the browser's default GET says nothing about what they send.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { formEvidence, isPersonalForm } from './evidence.js';

export function detectW11(ctx: CheckContext): Finding | undefined {
  const form = ctx.forms.find((f) => isPersonalForm(f) && f.method === 'get' && !f.scriptHandled);
  return form ? { id: 'W11', evidence: { form: formEvidence(form) } } : undefined;
}
