// WS-3e: bot-wall recognition (pure part of src/browser.ts).
import { describe, expect, it } from 'vitest';
import { isBotWall } from '../src/browser.js';

describe('isBotWall', () => {
  it.each([
    [403, { 'cf-mitigated': 'challenge' }, '', true],
    [503, {}, 'Just a moment...', true],
    [403, {}, 'Attention Required! | Cloudflare', true],
    [403, { server: 'AkamaiGHost' }, 'Access Denied', true],
    [403, {}, 'Access to this page has been denied', true],
    [429, { 'x-datadome': 'protected' }, '', true],
    [403, {}, 'Pardon Our Interruption', true],
    [403, {}, 'Forbidden', false],
    [200, { 'cf-mitigated': 'challenge' }, 'Just a moment...', false],
    [404, {}, 'Access Denied', false],
  ])('%i %j %s → %s', (status, headers, title, expected) => {
    expect(isBotWall(status, headers, title)).toBe(expected);
  });
});
