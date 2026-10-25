import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECK_IDS } from '../src/checks.js';

// Ground rule: no score, grade, severity or percentage in anything the engine emits.
const FORBIDDEN = /\b(score|grade|severity|rating|percent(age)?|compliant)\b/i;

/** The one line allowed to name the words: assertRedacted's key check (src/result.ts, WS-5b). */
const ENFORCER = '// no-score-enforcer';

function sourceFiles(): string[] {
  // Recursive so src/checks/ and src/data/ are covered too.
  return readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
}

function codeLines(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .filter((line) => !line.trimEnd().endsWith(ENFORCER))
    .map((line) => line.replace(/\/\/.*$/, ''));
}

describe('no-score rule', () => {
  it('no source line outside comments names a score-like field', () => {
    const offenders = sourceFiles().flatMap((f) =>
      codeLines(join('src', f))
        .filter((l) => FORBIDDEN.test(l))
        .map((l) => `${f}: ${l.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it('only the key check in src/result.ts carries the enforcer marker, once', () => {
    const marked = sourceFiles().flatMap((f) =>
      readFileSync(join('src', f), 'utf8')
        .split('\n')
        .filter((l) => l.includes(ENFORCER))
        .map(() => f),
    );
    expect(marked).toEqual(['result.ts']);
  });

  it('check ids are W1 to W16 in order', () => {
    expect(CHECK_IDS).toEqual(Array.from({ length: 16 }, (_, i) => `W${i + 1}`));
  });
});
