// WS-3e: result assembly (minimal; WS-5b adds info items and assertRedacted).
import { describe, expect, it } from 'vitest';
import { CATALOGUE_VERSION } from '../src/checks.js';
import { buildResult } from '../src/result.js';
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
