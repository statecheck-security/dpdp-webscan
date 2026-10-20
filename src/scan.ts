/**
 * Scan orchestration (plan WS-3 to WS-5). Not implemented yet: the scaffold
 * fixes the shape so the CLI, the sender and the tests can be built around it.
 *
 * Planned flow:
 *  1. parseTarget + resolvePublic (src/guard.ts).
 *  2. Fresh Chromium context, hardened (no downloads, no service workers, no
 *     granted permissions, memory cap); request interception re-checks every
 *     navigation, redirect (max 5) and subrequest against the guard.
 *  3. Baseline load: record third-party requests and identifiers before any
 *     interaction (W1, W2); detect the banner; inspect forms statically (W6, W8–W11).
 *  4. Fresh context: click reject, record what still fires (W3, W4, W5, W7).
 *  5. Fresh context: click accept, for the comparison.
 *  6. Up to 4 same-site pages found by link text (robots.txt honoured for these);
 *     text checks W12–W16.
 *  Timeouts: 20 s per page, 90 s per scan, then kill the process tree.
 *  Never submit a form. The only clicks are on consent-banner controls.
 */

import type { ScanResult } from './types.js';

export const PAGE_TIMEOUT_MS = 20_000;
export const SCAN_TIMEOUT_MS = 90_000;
export const MAX_PAGES = 5;
export const MAX_REDIRECTS = 5;

export async function runScan(target: URL): Promise<ScanResult> {
  throw new Error(`runScan is not implemented yet (WS-3 to WS-5); target was ${target.hostname}.`);
}
