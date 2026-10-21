/**
 * What every check sees (plan section 10): captured data only, no Playwright.
 * Built by src/scan.ts from one scan's collection.
 */

import type { BannerInfo } from '../banner.js';
import type { CaptureSnapshot } from '../capture.js';
import type { FormInfo } from '../forms.js';
import type { PageText } from '../text.js';
import type { PageVisit, TrackerCategory } from '../types.js';

export type TrackerLookup = (
  host: string,
) => { vendor: string; category: TrackerCategory; sessionReplay?: true } | undefined;

export interface CheckContext {
  target: URL;
  registrableDomain: string;
  /** Every page we tried. */
  pages: PageVisit[];
  /** Before any interaction, target page only. */
  baseline: CaptureSnapshot;
  /** Undefined when no banner or no reject control was clicked. */
  afterReject?: CaptureSnapshot;
  afterAccept?: CaptureSnapshot;
  banner?: BannerInfo;
  /** Page URLs with a persistent consent-settings control. */
  persistentControlFoundOn: string[];
  /** Forms on all scanned pages. */
  forms: FormInfo[];
  /** Page URL → text. Never leaves the context. */
  texts: Map<string, PageText>;
  trackers: TrackerLookup;
}
