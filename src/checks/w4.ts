/**
 * W4: accept on the banner's first layer, reject not (plan 2.2, WS-4b).
 * Evidence: how many clicks reject took when the reject run reached it
 * behind a settings layer (omitted when it found none), and the CMP vendor.
 */

import type { Finding } from '../types.js';
import type { CheckContext } from './context.js';

export function detectW4(ctx: CheckContext): Finding | undefined {
  const buttons = ctx.banner?.buttons.filter((b) => b.visible && b.clicksFromFirstLayer === 1) ?? [];
  if (!buttons.some((b) => b.role === 'accept') || buttons.some((b) => b.role === 'reject')) return undefined;
  return {
    id: 'W4',
    evidence: {
      ...(ctx.rejectClicks !== undefined && ctx.rejectClicks > 1 ? { clicksToReject: ctx.rejectClicks } : {}),
      ...(ctx.banner?.vendor ? { bannerVendor: ctx.banner.vendor } : {}),
    },
  };
}
