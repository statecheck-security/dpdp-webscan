/**
 * Information-only items (WS-5b, plan 2.2): no provision, no label. Pure,
 * like the checks; built from the same CheckContext. scs renders them as the
 * report's "what we saw" and "what we found" parts.
 *
 *  - banner: whether the requested page showed a consent banner, its vendor,
 *    and the first page with a persistent settings control.
 *  - site-cookies: the first-party session, security, load-balancing and
 *    consent-state identifiers on the requested page before any choice, by
 *    name only. W2 leaves exactly these out (BENIGN_IDENTIFIERS); the report
 *    names them, since the Act has no exemption for cookies a site needs
 *    (WS-2 owner review, catalogue 2026-10-25).
 *  - third-party-locations: third-party hosts the site contacted before any
 *    click, across the scanned pages, that are not trackers (trackers are in
 *    W1): payment gateways, CMPs, chat, fonts, unknown hosts. No country yet
 *    (v1): S.16 restricts no country, so this is information only.
 *  - notice-languages: the `lang` attributes seen (we check English text only).
 *  - coverage: the pages we read, where each published item W12–W16 was
 *    found, and the pages chosen but not loaded (robots.txt, or out of time;
 *    WS-11i), so the report can name what it could not check.
 *  - consent-comparison (WS-11h): tracker hosts and identifiers that only
 *    appeared after "accept", and those that only appeared after "reject",
 *    each against the requested page before any choice. It shows whether the
 *    banner holds anything back, and puts W1 and W3 in context. Emitted only
 *    when both choice runs completed; otherwise the banner item says why.
 *
 * Nothing about a page we never loaded: with no loaded page there is only coverage.
 */

import { isTracking } from '../data/trackers.js';
import type { CaptureSnapshot } from '../capture.js';
import type { ChoiceAdded, Info, SkippedPage } from '../types.js';
import type { CheckContext } from './context.js';
import { identifiersIn, trackerRequests } from './evidence.js';
import { decidingPeriod, grievancePeriods, PUBLISHED, searchedPages } from './published.js';

const MAX_DAYS = 90;

function found(ctx: CheckContext): NonNullable<Info['evidence']['found']> {
  const pages = searchedPages(ctx);
  const out: NonNullable<Info['evidence']['found']> = [];
  for (const id of ['W12', 'W13', 'W15', 'W16'] as const) {
    const page = pages.find(PUBLISHED[id]);
    if (page) out.push({ id, pageUrl: page.url });
  }
  // W14 counts as found only when the period W14 reads is within 90 days (otherwise it is a finding).
  const period = decidingPeriod(pages.flatMap(grievancePeriods));
  if (period && period.days <= MAX_DAYS) out.push({ id: 'W14', pageUrl: period.pageUrl });
  return out.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** Trackers contacted and identifiers set after the choice that the page had not loaded before any choice. */
function choiceAdded(ctx: CheckContext, run: CaptureSnapshot): ChoiceAdded {
  const before = new Set(
    trackerRequests(ctx.baseline, ctx.trackers)
      .filter((r) => isTracking(r.category))
      .map((r) => r.host),
  );
  const named = new Set(identifiersIn(ctx.baseline).map((i) => `${i.store} ${i.domain} ${i.name}`));
  return {
    thirdParties: trackerRequests(run, ctx.trackers).filter((r) => isTracking(r.category) && !before.has(r.host)),
    identifiers: identifiersIn(run, { sinceMarkOnly: true }).filter(
      (i) => !named.has(`${i.store} ${i.domain} ${i.name}`),
    ),
  };
}

/** Chosen pages we did not load: robots.txt said no (recorded in pages), or the scan ran out of time first. */
function skipped(ctx: CheckContext): SkippedPage[] {
  const robots = ctx.pages
    .filter((p) => p.status === 'skipped-robots')
    .map((p): SkippedPage => ({ url: p.url, reason: p.reason, skippedFor: 'robots' }));
  const tried = new Set(ctx.pages.map((p) => p.url));
  const time = (ctx.plannedPages ?? [])
    .filter((p) => !tried.has(p.url))
    .map((p): SkippedPage => ({ url: p.url, reason: p.reason, skippedFor: 'time' }));
  return [...robots, ...time];
}

export function buildInfo(ctx: CheckContext): Info[] {
  const searched = searchedPages(ctx).map((p) => p.url);
  const coverage: Info = {
    id: 'coverage',
    evidence: { pagesSearched: searched, found: found(ctx), pagesSkipped: skipped(ctx) },
  };
  if (ctx.pages[0]?.status !== 'loaded') return [coverage];

  const control = ctx.persistentControlFoundOn[0];
  const langs = [...new Set([...ctx.texts.values()].flatMap((t) => t.langs))];
  return [
    {
      id: 'banner',
      evidence: {
        bannerFound: ctx.banner !== undefined,
        ...(ctx.banner?.vendor ? { bannerVendor: ctx.banner.vendor } : {}),
        ...(ctx.banner && control ? { foundOn: control } : {}),
      },
    },
    { id: 'site-cookies', evidence: { identifiers: identifiersIn(ctx.baseline, { benign: true }) } },
    {
      id: 'third-party-locations',
      evidence: {
        thirdParties: trackerRequests(ctx.allPages ?? ctx.baseline, ctx.trackers).filter(
          (r) => !isTracking(r.category),
        ),
      },
    },
    { id: 'notice-languages', evidence: { pageLang: langs } },
    coverage,
    ...(ctx.afterAccept && ctx.afterReject
      ? [
          {
            id: 'consent-comparison' as const,
            evidence: {
              consentComparison: {
                afterAccept: choiceAdded(ctx, ctx.afterAccept),
                afterReject: choiceAdded(ctx, ctx.afterReject),
              },
            },
          },
        ]
      : []),
  ];
}
