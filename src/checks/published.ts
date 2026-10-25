/**
 * What a site publishes on the pages we scanned (WS-5a), for W12–W16. Pure:
 * reads `CheckContext.texts` (never stored) and the page list. All five
 * checks are absence findings, emitted when no searched page matches, with
 * `pagesSearched`; W14 also fires on a period longer than 90 days.
 * English only (plan section 1).
 */

import {
  BOARD_COMPLAINT,
  GRIEVANCE_WORDS,
  NUMBER_WORDS,
  PRIVACY_CONTACT,
  RESPONSE_WORDS,
  RIGHTS_MEANS,
  WITHDRAW_CONSENT,
  WITHDRAW_HOW,
} from '../data/keywords.js';
import type { PageText } from '../text.js';
import type { Finding, PageReason } from '../types.js';
import type { CheckContext } from './context.js';
import { maskContacts, quoteOf } from './evidence.js';

export interface PublishedPage {
  url: string;
  reason: PageReason;
  text: PageText;
}

/** Loaded pages whose text we read, in scan order. A page we could not read is not "searched". */
export function searchedPages(ctx: CheckContext): PublishedPage[] {
  return ctx.pages.flatMap((p) => {
    const text = p.status === 'loaded' ? ctx.texts.get(p.url) : undefined;
    return text ? [{ url: p.url, reason: p.reason, text }] : [];
  });
}

/** Sentences: split at line breaks, table cells and after `.`, `!` or `?`. */
export function sentences(text: string): string[] {
  return text
    .split(/\n|\t|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Table rows (lines with cells), cells joined: a rights table puts the right and the how side by side. */
export function tableRows(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.includes('\t'))
    .map((line) => line.replace(/\t/g, ' '));
}

export function matchesAny(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text));
}

const explainsWithdrawal = (s: string): boolean => WITHDRAW_CONSENT.test(s) && WITHDRAW_HOW.test(s);

/**
 * Whether a page publishes each item. The checks emit when no page does; the
 * coverage info item records the first page that does (WS-5b). W14 is a
 * period, not a yes/no, so it is in `grievancePeriods`.
 */
export const PUBLISHED: Readonly<Record<'W12' | 'W13' | 'W15' | 'W16', (page: PublishedPage) => boolean>> = {
  // A privacy contact; or a mailto link on a privacy or contact page.
  W12: (p) =>
    matchesAny(PRIVACY_CONTACT, p.text.text) ||
    (p.text.hasMailto && (p.reason === 'privacy' || p.reason === 'contact')),
  W13: (p) => matchesAny(RIGHTS_MEANS, p.text.text),
  W15: (p) => matchesAny(BOARD_COMPLAINT, p.text.text),
  // In one sentence, or one table row (a rights table puts the right and the how side by side).
  W16: (p) => sentences(p.text.text).some(explainsWithdrawal) || tableRows(p.text.text).some(explainsWithdrawal),
};

/** An absence finding: undefined when any searched page matches, or when we read no page at all. */
export function absence(
  ctx: CheckContext,
  id: Finding['id'],
  found: (page: PublishedPage) => boolean,
): Finding | undefined {
  const pages = searchedPages(ctx);
  if (pages.length === 0 || pages.some(found)) return undefined;
  return { id, evidence: { pagesSearched: pages.map((p) => p.url) } };
}

// --- W14: grievance periods ---

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUMBER = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .map((w) => escape(w).replace(/ /g, '\\s+'))
  .join('|');

/** "within 30 days", "in fifteen working days", "not later than thirty (30) days", "within one month". */
const PERIOD = new RegExp(
  `\\b(?:within|in|not later than|no later than|not exceeding|up to)\\s+(?:a period of\\s+)?` +
    `(\\d{1,3}|${NUMBER})(?:\\s*\\(\\d{1,3}\\))?\\s+(working\\s+|business\\s+|calendar\\s+)?(days?|weeks?|months?)\\b`,
  'gi',
);

export interface GrievancePeriod {
  days: number;
  /** The sentence around the period, at most 25 words, emails and long numbers masked. */
  quote: string;
  pageUrl: string;
  /** Response or resolution wording just before the period ("resolved within"), not "acknowledged within". */
  response: boolean;
}

/** How far back from a period its response wording may sit, within the sentence and after the previous period. */
const RESPONSE_LEAD_CHARS = 60;

/** Calendar days; working days count as 7 for every 5. Undefined for a number we do not read. */
export function periodDays(amount: string, qualifier: string | undefined, unit: string): number | undefined {
  const n = /^\d+$/.test(amount) ? Number(amount) : NUMBER_WORDS[amount.toLowerCase().replace(/\s+/g, ' ')];
  if (n === undefined) return undefined;
  const base = unit.toLowerCase().startsWith('week') ? n * 7 : unit.toLowerCase().startsWith('month') ? n * 30 : n;
  return qualifier && /working|business/i.test(qualifier) ? Math.ceil((base * 7) / 5) : base;
}

/** Up to 25 words around the match: 12 before it, the rest from it. Masked first, so the word count holds. */
function quoteAround(sentence: string, index: number): string {
  const before = maskContacts(sentence.slice(0, index)).split(/\s+/).filter(Boolean);
  const after = maskContacts(sentence.slice(index)).split(/\s+/).filter(Boolean);
  return quoteOf([...(before.length > 12 ? ['…'] : []), ...before.slice(-12), ...after].join(' '));
}

/** Periods tied to grievances: in the same or the previous sentence, or anywhere on a grievance page. */
export function grievancePeriods(page: PublishedPage): GrievancePeriod[] {
  const out: GrievancePeriod[] = [];
  const list = sentences(page.text.text);
  list.forEach((sentence, i) => {
    const related =
      page.reason === 'grievance' ||
      GRIEVANCE_WORDS.test(sentence) ||
      (i > 0 && GRIEVANCE_WORDS.test(list[i - 1] ?? ''));
    if (!related) return;
    let previousEnd = 0;
    for (const m of sentence.matchAll(PERIOD)) {
      const [whole, amount, qualifier, unit] = m;
      const lead = sentence.slice(Math.max(previousEnd, m.index - RESPONSE_LEAD_CHARS), m.index);
      previousEnd = m.index + whole.length;
      if (amount === undefined || unit === undefined) continue;
      const days = periodDays(amount, qualifier, unit);
      if (days === undefined) continue;
      out.push({ days, quote: quoteAround(sentence, m.index), pageUrl: page.url, response: RESPONSE_WORDS.test(lead) });
    }
  });
  return out;
}

/**
 * The period W14 reads: the longest response period when the pages give one, else the longest of all.
 * Without the response preference, "complaint records are kept for up to 6 months" next to "we resolve
 * complaints within 30 days" would make W14 report a period over 90 days (review, 2026-10-25).
 */
export function decidingPeriod(periods: readonly GrievancePeriod[]): GrievancePeriod | undefined {
  const responses = periods.filter((p) => p.response);
  const pool = responses.length > 0 ? responses : periods;
  return pool.reduce<GrievancePeriod | undefined>((a, b) => (!a || b.days > a.days ? b : a), undefined);
}
