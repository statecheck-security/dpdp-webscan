/**
 * W14: no grievance response period published, or one above 90 days (plan
 * 2.2, Rule 14(3)). Periods count when tied to grievances (same or previous
 * sentence, or a grievance page); working days count 7 for every 5. When a
 * site publishes several, the longest response period decides ("resolved
 * within", not "acknowledged within"), or the longest of all when none reads
 * as one (decidingPeriod). Evidence for a long period:
 * a quote of at most 25 words (ground rule 3) and the page it is on.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { decidingPeriod, grievancePeriods, searchedPages } from './published.js';

const MAX_DAYS = 90;

export function detectW14(ctx: CheckContext): Finding | undefined {
  const pages = searchedPages(ctx);
  if (pages.length === 0) return undefined;
  const pagesSearched = pages.map((p) => p.url);
  const period = decidingPeriod(pages.flatMap(grievancePeriods));
  if (!period) return { id: 'W14', evidence: { pagesSearched } };
  if (period.days <= MAX_DAYS) return undefined;
  return { id: 'W14', evidence: { pagesSearched, quote: period.quote, foundOn: period.pageUrl } };
}
