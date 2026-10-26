/**
 * W8: a session-replay or keystroke-capture script on a page with a
 * personal-data form (plan 2.2, WS-4c). Reads the baseline context after
 * every scanned page (no click yet), falling back to the target page alone
 * when the scan ran out of time. When the baseline shows no replay on a
 * form's page, the accept run counts too (WS-11d, owner 2026-10-26): replay
 * that waits for "accept" still records the form on that page, and S.8(5) /
 * Rule 6(1) read the same whether or not the visitor accepted. The accept run
 * covers the requested page only.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { formEvidence, isPersonalForm, trackerRequests } from './evidence.js';

export function detectW8(ctx: CheckContext): Finding | undefined {
  const isReplay = (host: string): boolean => ctx.trackers(host)?.sessionReplay === true;
  const before = trackerRequests(ctx.allPages ?? ctx.baseline, ctx.trackers).filter((r) => isReplay(r.host));
  const accepted = ctx.afterAccept
    ? trackerRequests(ctx.afterAccept, ctx.trackers).filter((r) => isReplay(r.host))
    : [];
  for (const form of ctx.forms.filter(isPersonalForm)) {
    const onPage = (r: { pageUrl: string }): boolean => r.pageUrl === form.pageUrl;
    const replay = before.some(onPage) ? before.filter(onPage) : accepted.filter(onPage);
    if (replay.length > 0) return { id: 'W8', evidence: { thirdParties: replay, form: formEvidence(form) } };
  }
  return undefined;
}
