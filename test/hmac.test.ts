import { describe, expect, it } from 'vitest';
import { MAX_SKEW_SECONDS, sign, verify } from '../src/hmac.js';

const secret = 'test-secret';
const body = '{"requestId":"abc","result":{}}';
const now = 1_800_000_000;

describe('hmac', () => {
  it('verifies its own signature', () => {
    expect(verify(body, secret, now, sign(body, secret, now), now)).toBe(true);
  });

  it('rejects a changed body, a wrong secret or a malformed signature', () => {
    const sig = sign(body, secret, now);
    expect(verify(`${body} `, secret, now, sig, now)).toBe(false);
    expect(verify(body, 'other', now, sig, now)).toBe(false);
    expect(verify(body, secret, now, 'zz', now)).toBe(false);
  });

  it('rejects stale and future timestamps beyond the allowed skew', () => {
    const old = now - MAX_SKEW_SECONDS - 1;
    expect(verify(body, secret, old, sign(body, secret, old), now)).toBe(false);
    const future = now + MAX_SKEW_SECONDS + 1;
    expect(verify(body, secret, future, sign(body, secret, future), now)).toBe(false);
  });
});
