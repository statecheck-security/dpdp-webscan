/**
 * W14: no grievance response period published, or one above 90 days (plan
 * 2.2, Rule 14(3)). Periods count when tied to grievances (same or previous
 * sentence, or a grievance page); working days count 7 for every 5. When a
 * site publishes several, the longest decides. Evidence for a long period:
 * a quote of at most 25 words (ground rule 3) and the page it is on.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { grievancePeriods, searchedPages } from './published.js';

const MAX_DAYS = 90;

export function detectW14(ctx: CheckContext): Finding | undefined {
  const pages = searchedPages(ctx);
  if (pages.length === 0) return undefined;
  const pagesSearched = pages.map((p) => p.url);
  const periods = pages.flatMap(grievancePeriods);
  if (periods.length === 0) return { id: 'W14', evidence: { pagesSearched } };
  const longest = periods.reduce((a, b) => (b.days > a.days ? b : a));
  if (longest.days <= MAX_DAYS) return undefined;
  return { id: 'W14', evidence: { pagesSearched, quote: longest.quote, foundOn: longest.pageUrl } };
}
