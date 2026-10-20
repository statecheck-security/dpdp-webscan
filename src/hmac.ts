/**
 * Signing for results posted to scs (`/api/scan-result`, plan WS-7).
 *
 * Signature = hex HMAC-SHA256 over `${timestamp}.${body}`, sent as
 * `X-Scan-Timestamp` (unix seconds) and `X-Scan-Signature`. scs rejects
 * timestamps older than MAX_SKEW_SECONDS and remembers request ids it has
 * accepted, so a captured request can't be replayed.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_SKEW_SECONDS = 300;

export function sign(body: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Mirror of the scs-side check, kept here so both ends are tested against one definition. */
export function verify(
  body: string,
  secret: string,
  timestamp: number,
  signature: string,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_SKEW_SECONDS) return false;
  const expected = Buffer.from(sign(body, secret, timestamp), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
