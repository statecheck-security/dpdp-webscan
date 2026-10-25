/**
 * `npm run scan -- <url>`: run one scan locally and write the result JSON to
 * results/ (gitignored). Review it before sending with `npm run scan:send`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTarget, resolvePublic, TargetError } from './guard.js';
import { RedactionError } from './result.js';
import { runScan } from './scan.js';
import type { ScanResult } from './types.js';

async function main(): Promise<number> {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npm run scan -- <url>');
    return 2;
  }

  let target: URL;
  try {
    target = parseTarget(input);
    await resolvePublic(target.hostname);
  } catch (err) {
    if (err instanceof TargetError) {
      console.error(`Refused (${err.code}): ${err.message}`);
      return 2;
    }
    throw err;
  }

  let result: ScanResult;
  try {
    result = await runScan(target);
  } catch (err) {
    // runScan refuses a result that is not redacted; nothing reaches disk (CLAUDE.md decision 5).
    if (err instanceof RedactionError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
  await mkdir('results', { recursive: true });
  const stamp = result.startedAt.replace(/[:.]/g, '-');
  const file = join('results', `${target.hostname}-${stamp}.json`);
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${file}: ${result.findings.length} findings, ${result.pages.length} pages${result.partial ? ' (partial)' : ''}.`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
