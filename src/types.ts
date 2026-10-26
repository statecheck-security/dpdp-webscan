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
export const ENGINE_VERSION = '0.13.0';

/** `form` and `other` fill the slots policy pages leave free (WS-3g): a likely form page first, then any nav link. */
export type PageReason = 'requested' | 'privacy' | 'cookies' | 'contact' | 'grievance' | 'terms' | 'form' | 'other';

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
  /**
   * Present (and false) only for a loaded page that never went network-idle before we read it
   * (WS-11i): scripts were still loading, so the report can say the page may hold more than we saw.
   */
  settled?: false;
}

/** A page chosen for the scan but not loaded (WS-11i): robots.txt disallowed it, or the scan ran out of time. */
export interface SkippedPage {
  url: string;
  reason: PageReason;
  skippedFor: 'robots' | 'time';
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
  /** ISO 3166-1 alpha-2 country the vendor is based in (WS-11f); absent when not known. Information only. */
  country?: string;
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
  /** `banner` info item: whether we saw a consent banner on the requested page. */
  bannerFound?: boolean;
  /** `coverage` info item: pages chosen but not loaded, and why (WS-11i). */
  pagesSkipped?: SkippedPage[];
  /** `coverage` info item: published items W12–W16 we did find, and the first page each is on. */
  found?: { id: CheckId; pageUrl: string }[];
  /**
   * `consent-comparison` info item (WS-11h): tracker hosts and identifier names each choice added that
   * the requested page had not loaded before any choice. Lists only; never a count compared or a ratio.
   */
  consentComparison?: { afterAccept: ChoiceAdded; afterReject: ChoiceAdded };
  /** `lang` attributes seen on the scanned pages (notice-languages info item). */
  pageLang?: string[];
  /** W6, W8–W11: every form that triggered the check, in page order, at most 5 (WS-11g). */
  forms?: FormEvidence[];
}

/** What one banner choice added on the requested page (consent-comparison, WS-11h). */
export interface ChoiceAdded {
  thirdParties: ThirdPartyRequest[];
  identifiers: IdentifierSet[];
}

/** A form in evidence: where it is and how it sends. Field types and names only; never values or labels. */
export interface FormEvidence {
  pageUrl: string;
  method: 'get' | 'post' | 'dialog';
  actionHost?: string;
  actionScheme?: 'http' | 'https';
  fields: { type: string; name: string }[];
  /**
   * W11 only: the page's referrer policy when the page sets one (meta tag over header; WS-11g).
   * Absent means the browser default, strict-origin-when-cross-origin, under which the query never
   * reaches another site in a Referer.
   */
  referrerPolicy?: ReferrerPolicyToken;
}

/** The referrer-policy tokens of the W3C Referrer Policy spec. */
export const REFERRER_POLICIES = [
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
] as const;

export type ReferrerPolicyToken = (typeof REFERRER_POLICIES)[number];

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
