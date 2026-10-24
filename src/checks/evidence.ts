/**
 * Turns a CaptureSnapshot into finding evidence (WS-4a). Shared by the
 * checks that report hosts or identifiers (W1, W2, later W3), so they all
 * group, label and order evidence the same way. Pure: no Playwright.
 */

import type { CaptureSnapshot } from '../capture.js';
import { BENIGN_IDENTIFIERS } from '../data/keywords.js';
import type { IdentifierSet, ThirdPartyRequest } from '../types.js';
import type { TrackerLookup } from './context.js';

/** Third-party requests in a snapshot, one entry per host and page, with the vendor when the list knows it. */
export function trackerRequests(snapshot: CaptureSnapshot, trackers: TrackerLookup): ThirdPartyRequest[] {
  const byHost = new Map<string, ThirdPartyRequest>();
  for (const r of snapshot.requests) {
    if (!r.isThirdParty) continue;
    const id = `${r.host} ${r.pageUrl}`;
    const entry = byHost.get(id);
    if (entry) {
      entry.count += r.count;
      continue;
    }
    const match = trackers(r.host);
    byHost.set(id, {
      host: r.host,
      category: match?.category ?? 'other',
      ...(match ? { vendor: match.vendor } : {}),
      pageUrl: r.pageUrl,
      count: r.count,
    });
  }
  return [...byHost.values()].sort((a, b) => a.host.localeCompare(b.host) || a.pageUrl.localeCompare(b.pageUrl));
}

export function isBenignIdentifier(name: string, firstParty: boolean): boolean {
  return firstParty && BENIGN_IDENTIFIERS.some((re) => re.test(name));
}

const STORE_ORDER: Record<IdentifierSet['store'], number> = { cookie: 0, localStorage: 1, sessionStorage: 2 };

/**
 * Cookie names and storage keys in a snapshot, benign first-party ones left
 * out. `sinceMarkOnly` keeps only those set after the snapshot's mark (W3).
 */
export function identifiersIn(snapshot: CaptureSnapshot, opts: { sinceMarkOnly?: boolean } = {}): IdentifierSet[] {
  const out: IdentifierSet[] = [];
  for (const c of snapshot.cookies) {
    if (opts.sinceMarkOnly && !c.setSinceMark) continue;
    if (isBenignIdentifier(c.name, c.firstParty)) continue;
    out.push({
      name: c.name,
      domain: c.domain,
      store: 'cookie',
      firstParty: c.firstParty,
      ...(c.expiresInSeconds !== undefined ? { expiresInSeconds: c.expiresInSeconds } : {}),
    });
  }
  for (const s of snapshot.storage) {
    const domain = new URL(s.origin).hostname;
    for (const key of opts.sinceMarkOnly ? s.keysSetSinceMark : s.keys) {
      if (isBenignIdentifier(key, s.firstParty)) continue;
      out.push({ name: key, domain, store: s.store, firstParty: s.firstParty });
    }
  }
  return out.sort(
    (a, b) =>
      STORE_ORDER[a.store] - STORE_ORDER[b.store] || a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name),
  );
}
