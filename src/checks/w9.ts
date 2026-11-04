/**
 * W9: a personal-data form submits to another company's host (plan 2.2,
 * WS-4c). Payment gateways are never W9 (plan section 10). Whether that host
 * is a processor under contract is for the owner to check; we only see where
 * the form sends. Evidence: every such form, at most 5 (WS-11g).
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { formsEvidence, isPersonalForm } from './evidence.js';

export function detectW9(ctx: CheckContext): Finding | undefined {
  const forms = ctx.forms.filter(
    (f) =>
      isPersonalForm(f) &&
      f.actionThirdParty &&
      f.actionHost !== undefined &&
      ctx.trackers(f.actionHost)?.paymentGateway !== true,
  );
  return forms.length > 0 ? { id: 'W9', evidence: { forms: formsEvidence(forms) } } : undefined;
}
