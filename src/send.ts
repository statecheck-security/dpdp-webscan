/**
 * `npm run scan:send -- <requestId> <results/file.json>`: post a reviewed
 * result to scs, which renders the report from its catalogue and emails it.
 * The engine holds only SCAN_HMAC_SECRET; never Sanity or Resend keys.
 */

import { readFile } from 'node:fs/promises';
import { sign } from './hmac.js';
import { assertRedacted } from './result.js';
import type { ScanResult } from './types.js';

async function main(): Promise<number> {
  const [requestId, file] = process.argv.slice(2);
  const endpoint = process.env.SCAN_RESULT_URL;
  const secret = process.env.SCAN_HMAC_SECRET;

  if (!requestId || !file) {
    console.error('Usage: npm run scan:send -- <requestId> <results/file.json>');
    return 2;
  }
  if (!endpoint || !secret) {
    console.error('Set SCAN_RESULT_URL and SCAN_HMAC_SECRET (see .env.example).');
    return 2;
  }

  const result = JSON.parse(await readFile(file, 'utf8')) as ScanResult;
  // Checked again here: the file may have been edited by hand since the scan wrote it.
  assertRedacted(result);
  const body = JSON.stringify({ requestId, result });
  const timestamp = Math.floor(Date.now() / 1000);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Scan-Timestamp': String(timestamp),
      'X-Scan-Signature': sign(body, secret, timestamp),
    },
    body,
  });

  if (!res.ok) {
    console.error(`scs answered ${res.status}: ${await res.text()}`);
    return 1;
  }
  console.log(`Sent result for request ${requestId}.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
