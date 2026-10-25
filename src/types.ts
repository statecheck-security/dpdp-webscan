/**
 * Result shape the engine emits. It carries check ids and evidence only:
 * titles, provisions, certainty labels and fixes are rendered by scs from its
 * catalogue (`src/data/scan/`), where the legal-accuracy gate covers them.
 *
 * Ground rule: there is no score, grade, severity or percentage anywhere in
 * this shape. A test asserts it.
 */

import type { CheckId, InfoId } from './checks.js';

// Bump with any change to the result shape or a detection rule (CLAUDE.md, decision 8).
export const ENGINE_VERSION = '0.5.0';

export type PageReason = 'requested' | 'privacy' | 'cookies' | 'contact' | 'grievance' | 'terms';

/**
 * Outcome of loading a page. `skipped-robots` is our choice to honour
 * robots.txt for the extra pages (plan section 4), not something that blocked us.
 */
export type PageStatus = 'loaded' | 'timeout' | 'skipped-robots' | 'blocked-bot-wall' | 'blocked-ssrf' | 'error';

/** A page the engine loaded (or tried to). */
export interface PageVisit {
  url: string;
  /** Why the page was chosen: the requested URL, or the link text that led to it. */
  reason: PageReason;
  status: PageStatus;
  httpStatus?: number;
}

/** Machine codes for why a scan is partial (WS-3a). scs renders the words. */
export const PARTIAL_REASONS = [
  'page-timeout',
  'scan-timeout',
  'bot-wall',
  'ssrf-blocked',
  'banner-not-found',
  'navigation-error',
] as const;

export type PartialReason = (typeof PARTIAL_REASONS)[number];

export const TRACKER_CATEGORIES = [
  'analytics',
  'ads',
  'social',
  'session-replay',
  'tag-manager',
  'cmp',
  'other',
] as const;

export type TrackerCategory = (typeof TRACKER_CATEGORIES)[number];

/** A third-party request seen on a page. Hostnames only, never full URLs with query strings. */
export interface ThirdPartyRequest {
  host: string;
  category?: TrackerCategory;
  vendor?: string;
  pageUrl: string;
  count: number;
}

/** A cookie or storage key. Values are never recorded. */
export interface IdentifierSet {
  name: string;
  domain: string;
  store: 'cookie' | 'localStorage' | 'sessionStorage';
  firstParty: boolean;
  /** Seconds until expiry; omitted for session cookies and storage. */
  expiresInSeconds?: number;
}

/** Evidence attached to a finding. Every field is optional; each check fills what it needs. */
export interface Evidence {
  pagesSearched?: string[];
  foundOn?: string;
  thirdParties?: ThirdPartyRequest[];
  identifiers?: IdentifierSet[];
  /** Short quote from the page (banner sentence, checkbox label), max ~25 words. */
  quote?: string;
  /** Extra clicks needed to reach a reject control (W4). */
  clicksToReject?: number;
  /** Consent-management vendor, when the banner matched a known CMP. */
  bannerVendor?: string;
  /** `lang` attributes seen on the scanned pages (notice-languages info item). */
  pageLang?: string[];
  form?: {
    pageUrl: string;
    method: 'get' | 'post' | 'dialog';
    actionHost?: string;
    actionScheme?: 'http' | 'https';
    /** Field types and names only; never values. */
    fields: { type: string; name: string }[];
  };
}

export interface Finding {
  id: CheckId;
  evidence: Evidence;
}

export interface Info {
  id: InfoId;
  evidence: Evidence;
}

export interface ScanResult {
  engineVersion: string;
  catalogueVersion: string;
  target: string;
  startedAt: string;
  finishedAt: string;
  /** True when a timeout or block stopped part of the scan. */
  partial: boolean;
  /** Why the scan is partial; empty when `partial` is false. */
  partialReasons: PartialReason[];
  pages: PageVisit[];
  findings: Finding[];
  info: Info[];
}
