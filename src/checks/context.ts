/**
 * What every check sees (plan section 10): captured data only, no Playwright.
 * Built by src/scan.ts from one scan's collection.
 */

import type { BannerInfo } from '../banner.js';
import type { CaptureSnapshot } from '../capture.js';
import type { FormInfo } from '../forms.js';
import type { TrackerMatch } from '../data/trackers.js';
import type { PageText } from '../text.js';
import type { PageReason, PageVisit } from '../types.js';

/** `categorise` from src/data/trackers.ts in production; tests add the fixture hosts. */
export type TrackerLookup = (host: string) => TrackerMatch | undefined;

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
  /** Baseline context after every scanned page, no click; undefined if the scan ran out of time first. */
  allPages?: CaptureSnapshot;
  banner?: BannerInfo;
  /** Clicks the reject run needed; undefined when no reject (or save) control was reached. */
  rejectClicks?: number;
  /** Page URLs with a persistent consent-settings control. */
  persistentControlFoundOn: string[];
  /** Forms on all scanned pages. */
  forms: FormInfo[];
  /** Extra pages chosen for the scan (WS-11i); those absent from `pages` were never started for lack of time. */
  plannedPages?: readonly { url: string; reason: PageReason }[];
  /** Page URL → its Referrer-Policy response header, as sent (W11, WS-11g). Never leaves the context. */
  referrerHeaders?: ReadonlyMap<string, string>;
  /** Page URL → text. Never leaves the context. */
  texts: Map<string, PageText>;
  trackers: TrackerLookup;
}
