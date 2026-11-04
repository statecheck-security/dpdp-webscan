// WS-11j: the Consent Mode exception to "hostnames, not URLs" stays as narrow as decision 34 says.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { consentModeDenied } from '../src/consentMode.js';

const ga = (query: string) => new URL(`https://region1.google-analytics.com/g/collect?v=2&${query}`);

describe('consentModeDenied', () => {
  it.each([
    ['both denied', ga('gcs=G100'), true],
    ['both granted', ga('gcs=G111'), false],
    ['ads granted, analytics denied', ga('gcs=G110'), false],
    ['ads denied, analytics granted', ga('gcs=G101'), false],
    ['not set', ga('gcs=G1--'), false],
    ['no gcs at all', ga('tid=G-XXXX'), false],
    ['a longer code', ga('gcs=G1000'), false],
    ['an Ads host', new URL('https://www.googleadservices.com/pagead/conversion/1/?gcs=G100'), true],
    ['a google.com subdomain', new URL('https://adservice.google.com/ddm/fls/z?gcs=G100'), true],
  ])('%s → %s', (_name, url, expected) => {
    expect(consentModeDenied(url)).toBe(expected);
  });

  it.each([
    ['another company', 'https://stats.example.in/collect?gcs=G100'],
    ['a look-alike domain', 'https://google-analytics.com.evil.in/collect?gcs=G100'],
    ['a suffix without a dot', 'https://notgoogle.com/collect?gcs=G100'],
  ])('never reads %s', (_name, url) => {
    expect(consentModeDenied(new URL(url))).toBe(false);
  });

  it('uses the host list it is given', () => {
    const url = new URL('https://tracker-fixture.in/g/collect?gcs=G100');
    expect(consentModeDenied(url)).toBe(false);
    expect(consentModeDenied(url, ['tracker-fixture.in'])).toBe(true);
  });
});

describe('the exception in the source', () => {
  it('reads exactly one query parameter, gcs, and nothing else of the URL', () => {
    const source = readFileSync('src/consentMode.ts', 'utf8');
    expect(source.match(/searchParams/g)).toHaveLength(1);
    expect(source).toContain("searchParams.get('gcs')");
    expect(source).not.toMatch(/\.(href|search|pathname)\b/);
  });

  it('is the only place that reads query parameters during capture', () => {
    expect(readFileSync('src/capture.ts', 'utf8')).not.toMatch(/searchParams|\.search\b/);
  });
});
