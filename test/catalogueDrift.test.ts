// WS-1: CHECK_IDS, INFO_IDS and CATALOGUE_VERSION must match the scs catalogue (src/data/scan/).
// Read with regexes, not a cross-repo TypeScript import, so the engine never depends on scs code.
// Skips with a note when scs is not checked out next to this repo (or at SCS_PATH).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE_VERSION, CHECK_IDS, INFO_IDS, SCS_PENDING_INFO_IDS } from '../src/checks.js';
import { ENGINE_VERSION } from '../src/types.js';

const scsRoot = resolve(process.env.SCS_PATH ?? '../scs');
const catalogueDir = join(scsRoot, 'src', 'data', 'scan');
const checksFile = join(catalogueDir, 'checks.ts');
const present = existsSync(checksFile);

if (!present) {
  console.warn(`catalogueDrift: skipped, ${checksFile} not found (set SCS_PATH or check out scs next to this repo).`);
}

/** All `id: '...'` values in the order they appear. */
function idsIn(source: string): string[] {
  return [...source.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
}

/** The CATALOGUE_VERSION string literal, wherever in the catalogue folder it is declared. */
function catalogueVersionIn(dir: string): string | undefined {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const m = /CATALOGUE_VERSION\s*(?::\s*string\s*)?=\s*['"]([^'"]+)['"]/.exec(readFileSync(join(dir, file), 'utf8'));
    if (m?.[1]) return m[1];
  }
  return undefined;
}

describe('catalogue drift helpers', () => {
  it('reads ids and the version from catalogue-shaped source', () => {
    expect(idsIn(`{ id: 'W1', title: 'x' }, { id: "banner" }`)).toEqual(['W1', 'banner']);
  });
});

// release/v1 (WS-11): ids waiting for the scs catalogue are allowed only before 1.0.0.
describe('ids waiting for scs', () => {
  it('are none once the engine is 1.0.0 or later', () => {
    const major = Number(ENGINE_VERSION.split('.')[0]);
    expect(major >= 1 ? SCS_PENDING_INFO_IDS : []).toEqual([]);
  });
});

describe.skipIf(!present)('catalogue drift against scs', () => {
  it('check ids match', () => {
    const ids = idsIn(readFileSync(checksFile, 'utf8')).filter((id) => /^W\d+$/.test(id));
    expect(ids).toEqual([...CHECK_IDS]);
  });

  it('info ids match', () => {
    const ids = new Set(idsIn(readFileSync(checksFile, 'utf8')));
    expect(INFO_IDS.filter((id) => !ids.has(id) && !SCS_PENDING_INFO_IDS.includes(id))).toEqual([]);
  });

  it('CATALOGUE_VERSION matches', () => {
    expect(catalogueVersionIn(catalogueDir)).toBe(CATALOGUE_VERSION);
  });
});
