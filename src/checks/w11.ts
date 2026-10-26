/**
 * W11: a personal-data form that sends by GET, so what the visitor types
 * lands in the URL (plan 2.2, WS-4c). Forms with neither a method nor an
 * action attribute are left out: a script almost always submits those, and
 * the browser's default GET says nothing about what they send.
 *
 * Referer note (plan 2.2, WS-11g): the URL with the query can reach other
 * companies in the Referer header of requests made from the next page. Each
 * form carries its page's referrer policy when the page sets one, and the
 * evidence lists the third parties those pages contacted, so the report can
 * add the note only when the policy lets the query through (unsafe-url,
 * no-referrer-when-downgrade) and a third party is there to receive it. The
 * form's own page stands in for the page the form opens, which we never load.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import {
  effectiveReferrerPolicy,
  formEvidence,
  isPersonalForm,
  MAX_FORMS_IN_EVIDENCE,
  trackerRequests,
} from './evidence.js';

export function detectW11(ctx: CheckContext): Finding | undefined {
  const forms = ctx.forms
    .filter((f) => isPersonalForm(f) && f.method === 'get' && !f.scriptHandled)
    .slice(0, MAX_FORMS_IN_EVIDENCE);
  if (forms.length === 0) return undefined;
  const pages = new Set(forms.map((f) => f.pageUrl));
  const thirdParties = trackerRequests(ctx.allPages ?? ctx.baseline, ctx.trackers).filter((r) => pages.has(r.pageUrl));
  return {
    id: 'W11',
    evidence: {
      forms: forms.map((f) => {
        const policy = effectiveReferrerPolicy(f.referrerMeta, ctx.referrerHeaders?.get(f.pageUrl));
        return { ...formEvidence(f), ...(policy ? { referrerPolicy: policy } : {}) };
      }),
      ...(thirdParties.length > 0 ? { thirdParties } : {}),
    },
  };
}
