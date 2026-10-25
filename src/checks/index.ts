/**
 * Runs every check in id order (WS-4, WS-5). Each check is a pure
 * `detectWN(ctx): Finding | undefined` in src/checks/wN.ts, added here as
 * each one lands.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';
import { detectW1 } from './w1.js';
import { detectW2 } from './w2.js';
import { detectW3 } from './w3.js';
import { detectW4 } from './w4.js';
import { detectW5 } from './w5.js';
import { detectW6 } from './w6.js';
import { detectW7 } from './w7.js';
import { detectW8 } from './w8.js';
import { detectW9 } from './w9.js';
import { detectW10 } from './w10.js';
import { detectW11 } from './w11.js';

export type Detector = (ctx: CheckContext) => Finding | undefined;

const DETECTORS: readonly Detector[] = [
  detectW1,
  detectW2,
  detectW3,
  detectW4,
  detectW5,
  detectW6,
  detectW7,
  detectW8,
  detectW9,
  detectW10,
  detectW11,
];

export function runChecks(ctx: CheckContext): Finding[] {
  return DETECTORS.map((detect) => detect(ctx)).filter((f): f is Finding => f !== undefined);
}
