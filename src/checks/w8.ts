/**
 * W8: a session-replay or keystroke-capture script on a page with a
 * personal-data form (plan 2.2, WS-4c). Reads the baseline context after
 * every scanned page (no click yet), falling back to the target page alone
 * when the scan ran out of time. A replay script loaded only after "accept"
 * is not seen.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { formEvidence, isPersonalForm, trackerRequests } from './evidence.js';

export function detectW8(ctx: CheckContext): Finding | undefined {
  const requests = trackerRequests(ctx.allPages ?? ctx.baseline, ctx.trackers);
  for (const form of ctx.forms.filter(isPersonalForm)) {
    const replay = requests.filter((r) => r.pageUrl === form.pageUrl && ctx.trackers(r.host)?.sessionReplay);
    if (replay.length > 0) return { id: 'W8', evidence: { thirdParties: replay, form: formEvidence(form) } };
  }
  return undefined;
}
