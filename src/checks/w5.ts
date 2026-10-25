/**
 * W5: consent inferred from browsing (plan 2.2, WS-4b). The banner has a
 * sentence like "by continuing to browse you agree" and no reject control on
 * its first layer. A sentence that ties consent to a click ("by clicking
 * Accept") is an affirmative action and never counts. Evidence: that
 * sentence, at most 25 words (ground rule 3).
 */

import { CLICK_CONSENT, IMPLIED_CONSENT } from '../data/keywords.js';
import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { quoteOf } from './evidence.js';

export function detectW5(ctx: CheckContext): Finding | undefined {
  const banner = ctx.banner;
  if (!banner || banner.buttons.some((b) => b.role === 'reject' && b.clicksFromFirstLayer === 1)) return undefined;
  const sentence = banner.text.split(/(?<=[.!?])\s+/).find((s) => IMPLIED_CONSENT.test(s) && !CLICK_CONSENT.test(s));
  if (!sentence) return undefined;
  return {
    id: 'W5',
    evidence: { quote: quoteOf(sentence), ...(banner.vendor ? { bannerVendor: banner.vendor } : {}) },
  };
}
