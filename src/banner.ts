/**
 * Consent-banner detection and the only clicks the engine ever makes (WS-4b).
 *
 * Not implemented yet: the shapes are fixed now (WS-3e) so the orchestrator
 * and CheckContext compile, and every function reports "nothing found". Until
 * WS-4b lands no click happens, so the reject and accept runs are skipped.
 * Rule: never click anything outside the banner element, never more than 3 clicks.
 */

import type { Page } from 'playwright';

export interface BannerButton {
  label: string;
  role: 'accept' | 'reject' | 'settings' | 'other';
  visible: boolean;
  clicksFromFirstLayer: number;
}

export interface BannerInfo {
  vendor?: string;
  /** At most 400 characters; matched by checks, never copied whole into a result. */
  text: string;
  buttons: BannerButton[];
}

export type FindBanner = (page: Page) => Promise<BannerInfo | undefined>;
/** Resolves true when the control was clicked. */
export type ClickBanner = (page: Page, banner: BannerInfo) => Promise<boolean>;
/** Resolves true when a persistent "cookie settings" style control is visible outside the banner. */
export type FindPersistentControl = (page: Page) => Promise<boolean>;

export const findBanner: FindBanner = () => Promise.resolve(undefined);
export const clickReject: ClickBanner = () => Promise.resolve(false);
export const clickAccept: ClickBanner = () => Promise.resolve(false);
export const findPersistentControl: FindPersistentControl = () => Promise.resolve(false);
