// WS-3b: log call sites in src/ never pass a field whose name suggests a value, body, page text or full URL.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_FIELD = /\b(value|values|body|text|html|content|url|href|query|cookie|cookies|email|password)\s*[:,}]/i;

describe('log call sites', () => {
  it('never log a value-shaped field', () => {
    const offenders: string[] = [];
    for (const file of readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join('src', file), 'utf8');
      // `log(` or `opts.log(`, up to the closing `)` of a single-line call or the first 300 chars.
      for (const m of source.matchAll(/\blog\(\s*'[^']*'\s*,([^)]{0,300})\)/g)) {
        if (FORBIDDEN_FIELD.test(m[1] ?? '')) offenders.push(`${file}: ${m[0].replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
