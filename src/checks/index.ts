/**
 * Runs every check in id order (WS-4, WS-5). Each check is a pure
 * `detectWN(ctx): Finding | undefined` in src/checks/wN.ts; none exist yet,
 * so a scan has no findings until WS-4 adds them here.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';

export type Detector = (ctx: CheckContext) => Finding | undefined;

const DETECTORS: readonly Detector[] = [];

export function runChecks(ctx: CheckContext): Finding[] {
  return DETECTORS.map((detect) => detect(ctx)).filter((f): f is Finding => f !== undefined);
}
