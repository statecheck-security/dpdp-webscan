/**
 * Turns captured data into finding evidence (WS-4a, WS-4c). Shared by the
 * checks that report hosts, identifiers (W1–W3) or forms (W6, W8–W11), so
 * they all group, label and order evidence the same way. Pure: no Playwright.
 */

import type { CaptureSnapshot } from '../capture.js';
import { BENIGN_IDENTIFIERS, LARAVEL_CSRF, LARAVEL_SESSION } from '../data/keywords.js';
import type { FormInfo } from '../forms.js';
import type { Evidence, IdentifierSet, ThirdPartyRequest } from '../types.js';
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

/** `laravelSite`: the snapshot holds Laravel's first-party CSRF cookie, so `<app>_session` is its session cookie. */
export function isBenignIdentifier(name: string, firstParty: boolean, laravelSite = false): boolean {
  return firstParty && (BENIGN_IDENTIFIERS.some((re) => re.test(name)) || (laravelSite && LARAVEL_SESSION.test(name)));
}

const STORE_ORDER: Record<IdentifierSet['store'], number> = { cookie: 0, localStorage: 1, sessionStorage: 2 };

/**
 * Cookie names and storage keys in a snapshot, benign first-party ones left
 * out. `sinceMarkOnly` keeps only those set after the snapshot's mark (W3).
 * `benign: true` keeps only the benign ones instead (the `site-cookies` info
 * item), so the finding and the info item always split the same list.
 */
export function identifiersIn(
  snapshot: CaptureSnapshot,
  opts: { sinceMarkOnly?: boolean; benign?: boolean } = {},
): IdentifierSet[] {
  // Read from every cookie, not just those since the mark: the CSRF cookie is usually set on the first load.
  const laravelSite = snapshot.cookies.some((c) => c.firstParty && LARAVEL_CSRF.test(c.name));
  const keep = (name: string, firstParty: boolean, cookie: boolean): boolean =>
    isBenignIdentifier(name, firstParty, cookie && laravelSite) === (opts.benign ?? false);
  const out: IdentifierSet[] = [];
  for (const c of snapshot.cookies) {
    if (opts.sinceMarkOnly && !c.setSinceMark) continue;
    if (!keep(c.name, c.firstParty, true)) continue;
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
      if (!keep(key, s.firstParty, false)) continue;
      out.push({ name: key, domain, store: s.store, firstParty: s.firstParty });
    }
  }
  return out.sort(
    (a, b) =>
      STORE_ORDER[a.store] - STORE_ORDER[b.store] || a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name),
  );
}

/** A form asks for personal data when any field does (WS-4c). W8–W11 look only at these. */
export function isPersonalForm(form: FormInfo): boolean {
  return form.fields.some((f) => f.personal);
}

/** Form evidence: where it is, how it sends, field types and names. Never values or labels. */
export function formEvidence(form: FormInfo): NonNullable<Evidence['form']> {
  return {
    pageUrl: form.pageUrl,
    method: form.method,
    ...(form.actionHost ? { actionHost: form.actionHost } : {}),
    ...(form.actionScheme ? { actionScheme: form.actionScheme } : {}),
    fields: form.fields.map(({ type, name }) => ({ type, name })),
  };
}

const MAX_QUOTE_WORDS = 25;

/** Contact details never reach a quote (ground rule 3); unmasked, an email would also fail assertRedacted. */
export function maskContacts(text: string): string {
  return text.replace(/\S+@\S+/g, '[email]').replace(/\+?\d[\d\s()-]{7,}\d/g, '[number]');
}

/**
 * A quote of at most 25 words (ground rule 3: quotes only for W5 and W14), contacts masked, with an
 * ellipsis when cut.
 */
export function quoteOf(sentence: string): string {
  const words = maskContacts(sentence).trim().split(/\s+/);
  return words.length <= MAX_QUOTE_WORDS ? words.join(' ') : `${words.slice(0, MAX_QUOTE_WORDS).join(' ')} …`;
}
