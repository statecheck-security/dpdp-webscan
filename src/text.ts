/**
 * Page text for the W12–W16 matchers (WS-5a). Hard rule: `PageText` lives in
 * CheckContext only; src/result.ts has no path to it.
 *
 * Not implemented yet: the shape is fixed now (WS-3e) and `extractText`
 * returns nothing until WS-5a.
 */

import type { Page } from 'playwright';

export interface PageText {
  /** `document.body.innerText`, whitespace collapsed. Matched, never stored. */
  text: string;
  /** `html[lang]` and any other `lang` attributes seen. */
  langs: string[];
}

export type ExtractText = (page: Page) => Promise<PageText | undefined>;

export const extractText: ExtractText = () => Promise.resolve(undefined);
