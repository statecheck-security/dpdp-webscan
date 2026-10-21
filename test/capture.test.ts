// WS-3c: the capture's source never touches a value, a body, headers or a full storage dump.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isThirdParty } from '../src/capture.js';

describe('capture source', () => {
  const source = readFileSync('src/capture.ts', 'utf8');

  it.each([
    ['.value', /\.value\b/],
    ['storageState', /storageState/],
    ['postData', /postData/],
    ['headers', /headers\s*\(|allHeaders/],
    ['bodies', /\.(body|text|json)\s*\(/],
    ['getItem', /getItem/],
    ['innerText / textContent', /innerText|textContent/],
  ])('never reads %s', (_name, pattern) => {
    expect(source).not.toMatch(pattern);
  });
});

describe('isThirdParty', () => {
  it.each([
    ['www.example.co.in', 'example.co.in', false],
    ['cdn.example.co.in', 'example.co.in', false],
    ['www.google-analytics.com', 'example.co.in', true],
    ['example.in', 'example.co.in', true],
  ])('%s against %s → %s', (host, site, expected) => {
    expect(isThirdParty(host, site)).toBe(expected);
  });
});
