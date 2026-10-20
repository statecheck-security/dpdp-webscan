import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECK_IDS } from '../src/checks.js';

// Ground rule: no score, grade, severity or percentage in anything the engine emits.
const FORBIDDEN = /\b(score|grade|severity|rating|percent(age)?|compliant)\b/i;

function codeLines(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/\/\/.*$/, ''));
}

describe('no-score rule', () => {
  it('no source line outside comments names a score-like field', () => {
    const offenders = readdirSync('src')
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) => codeLines(join('src', f)).filter((l) => FORBIDDEN.test(l)).map((l) => `${f}: ${l.trim()}`));
    expect(offenders).toEqual([]);
  });

  it('check ids are W1 to W16 in order', () => {
    expect(CHECK_IDS).toEqual(Array.from({ length: 16 }, (_, i) => `W${i + 1}`));
  });
});
