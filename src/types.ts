/**
 * Result shape the engine emits. It carries check ids and evidence only:
 * titles, provisions, certainty labels and fixes are rendered by scs from its
 * catalogue (`src/data/scan/`), where the legal-accuracy gate covers them.
 *
 * Ground rule: there is no score, grade, severity or percentage anywhere in
 * this shape. A test asserts it.
 */

import type { CheckId, InfoId } from './checks.js';

export const ENGINE_VERSION = '0.0.0';

/** A page the engine loaded (or tried to). */
export interface PageVisit {
  url: string;
  /** Why the page was chosen: the requested URL, or the link text that led to it. */
  reason: 'requested' | 'privacy' | 'cookies' | 'contact' | 'grievance' | 'terms';
  status: 'loaded' | 'timeout' | 'blocked-robots' | 'blocked-bot-wall' | 'blocked-ssrf' | 'error';
  httpStatus?: number;
}

/** A third-party request seen on a page. Hostnames only, never full URLs with query strings. */
export interface ThirdPartyRequest {
  host: string;
  category?: 'analytics' | 'ads' | 'social' | 'session-replay' | 'tag-manager' | 'cmp' | 'other';
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
  pages: PageVisit[];
  findings: Finding[];
  info: Info[];
}
