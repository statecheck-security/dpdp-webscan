// WS-3e, WS-5b: result assembly and the exit-side redaction check.
import { describe, expect, it } from 'vitest';
import { CATALOGUE_VERSION } from '../src/checks.js';
import { assertRedacted, buildResult, RedactionError } from '../src/result.js';
import type { ScanResult } from '../src/types.js';
import { ENGINE_VERSION } from '../src/types.js';

const base = {
  target: new URL('https://www.example.in/'),
  startedAt: new Date('2026-10-22T10:00:00.000Z'),
  finishedAt: new Date('2026-10-22T10:01:00.000Z'),
  pages: [],
  info: [],
};

describe('buildResult', () => {
  it('carries both versions and ISO timestamps, and is not partial without a reason', () => {
    expect(buildResult({ ...base, partialReasons: [], findings: [] })).toEqual({
      engineVersion: ENGINE_VERSION,
      catalogueVersion: CATALOGUE_VERSION,
      target: 'https://www.example.in/',
      startedAt: '2026-10-22T10:00:00.000Z',
      finishedAt: '2026-10-22T10:01:00.000Z',
      partial: false,
      partialReasons: [],
      pages: [],
      findings: [],
      info: [],
    });
  });

  it('is partial with reasons in a fixed order, without duplicates', () => {
    const result = buildResult({
      ...base,
      partialReasons: ['scan-timeout', 'page-timeout', 'scan-timeout'],
      findings: [],
    });
    expect(result.partial).toBe(true);
    expect(result.partialReasons).toEqual(['page-timeout', 'scan-timeout']);
  });

  it('sorts findings by check id, numerically', () => {
    const findings = (['W12', 'W2', 'W10', 'W1'] as const).map((id) => ({ id, evidence: {} }));
    expect(buildResult({ ...base, partialReasons: [], findings }).findings.map((f) => f.id)).toEqual([
      'W1',
      'W2',
      'W10',
      'W12',
    ]);
  });
});

describe('buildResult info order', () => {
  it('orders info items as INFO_IDS', () => {
    const info = (['coverage', 'banner', 'notice-languages'] as const).map((id) => ({ id, evidence: {} }));
    expect(buildResult({ ...base, info, partialReasons: [], findings: [] }).info.map((i) => i.id)).toEqual([
      'banner',
      'notice-languages',
      'coverage',
    ]);
  });
});

describe('assertRedacted', () => {
  const clean = (): ScanResult => ({
    ...buildResult({ ...base, partialReasons: [], findings: [] }),
    pages: [{ url: 'https://www.example.in/@shop', reason: 'requested', status: 'loaded', httpStatus: 200 }],
    findings: [
      {
        id: 'W2',
        evidence: { identifiers: [{ name: '_ga', domain: 'example.in', store: 'cookie', firstParty: true }] },
      },
      { id: 'W14', evidence: { quote: 'Write to [email]. We resolve grievances within 120 days.' } },
    ],
  });

  it('passes a clean result, including an @ in a page path', () => {
    expect(() => assertRedacted(clean())).not.toThrow();
  });

  it.each([
    [
      'a smuggled cookie value',
      (r: ScanResult) => {
        r.findings[0]?.evidence.identifiers?.push({
          name: 'sid=SECRET-VALUE-DO-NOT-RECORD',
          domain: 'example.in',
          store: 'cookie',
          firstParty: true,
        });
      },
      'value-token',
      '$.findings[0].evidence.identifiers[1].name',
    ],
    [
      'an email address in a quote',
      (r: ScanResult) => {
        r.findings[1] = { id: 'W14', evidence: { quote: 'Write to grievance@example.in within 120 days.' } };
      },
      'email',
      '$.findings[1].evidence.quote',
    ],
    [
      'a string longer than 400 characters',
      (r: ScanResult) => {
        r.findings[1] = { id: 'W14', evidence: { quote: 'x '.repeat(201) } };
      },
      'string-too-long',
      '$.findings[1].evidence.quote',
    ],
    [
      'a score-like key',
      (r: ScanResult) => {
        Object.assign(r, { complianceScore: 3 });
      },
      'forbidden-key',
      '$.complianceScore',
    ],
  ])('refuses %s, naming the path but not the value', (_name, spoil, code, path) => {
    const r = clean();
    spoil(r);
    try {
      assertRedacted(r);
      expect.unreachable('assertRedacted should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RedactionError);
      expect(err).toMatchObject({ code, path });
      expect(String((err as Error).message)).not.toContain('SECRET');
      expect(String((err as Error).message)).not.toContain('grievance@');
    }
  });
});
