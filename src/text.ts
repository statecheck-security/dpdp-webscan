/**
 * Page text for the W12–W16 matchers (WS-5a). Hard rule: `PageText` lives in
 * CheckContext only; src/result.ts has no path to it. The matchers are pure
 * and live in src/checks/published.ts.
 */

import type { Page } from 'playwright';
import { evaluateIn } from './browser.js';

export interface PageText {
  /**
   * `document.body.innerText`: spaces collapsed, line breaks kept (one per break), table cells
   * separated by a tab, so a table row stays one line (W16). Matched, never stored.
   */
  text: string;
  /** `html[lang]` first, then any other `lang` attributes seen, lower-cased. */
  langs: string[];
  /** The page links to a `mailto:` address (W12 counts one on a privacy or contact page). */
  hasMailto: boolean;
}

export type ExtractText = (page: Page) => Promise<PageText | undefined>;

/** Long policy pages fit; a page past this is cut, and the matchers see its first part only. */
const MAX_TEXT_CHARS = 200_000;
const MAX_LANGS = 20;

interface InPageArgs {
  maxText: number;
  maxLangs: number;
}

/** Runs in the page. */
function inPage(a: InPageArgs): PageText {
  const raw = document.body?.innerText ?? '';
  const text = raw
    .replace(/[^\S\n\t]+/g, ' ')
    .replace(/ *\t[ \t]*/g, '\t')
    .replace(/[ \t]*\n\s*/g, '\n')
    .trim()
    .slice(0, a.maxText);
  const langs: string[] = [];
  const root = document.documentElement.getAttribute('lang');
  if (root) langs.push(root.toLowerCase());
  for (const el of document.querySelectorAll('[lang]')) {
    const lang = (el.getAttribute('lang') ?? '').toLowerCase();
    if (lang && !langs.includes(lang) && langs.length < a.maxLangs) langs.push(lang);
  }
  return { text, langs, hasMailto: document.querySelector('a[href^="mailto:" i]') !== null };
}

export const extractText: ExtractText = (page) =>
  evaluateIn(page, inPage, { maxText: MAX_TEXT_CHARS, maxLangs: MAX_LANGS });
