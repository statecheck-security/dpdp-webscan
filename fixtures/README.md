# Fixture sites

Local static pages the engine is tested against (plan WS-8). `test/fixtures.ts` fulfils every browser request from these folders through Playwright routing, so tests never touch the internet.

**Hosts.** The scanned site is `https://site.fixture.in`; fake third parties are `tracker-fixture.in`, `replay-fixture.in`, `forms-fixture.in` and `cmp-fixture.in`; `moved-fixture.in` is the same site under another domain, for a requested URL that redirects there. Each third party is its own registrable domain, as a real vendor is; under `fixture.in` they would share the site's eTLD+1 and count as first party. They end in `.in` so `src/guard.ts` accepts them unchanged (it blocks `.test`, `.example` and `.local`; never weaken it for a fixture). `fakeLookup` returns a public address for them (`private.fixture.in` and `metadata.fixture.in` resolve to private ones, for SSRF tests).

**Redirects.** Playwright route handlers only see the first URL of a redirect chain; later hops go through the engine's egress proxy (`src/egress.ts`). In tests the proxy's dial is always replaced: `noNetworkDial` refuses everything, and `serveFixtureHttp` serves a fixture from a local `node:http` server for plain-http redirect chains.

**Layout.** One folder per fixture, `index.html` first, extra pages (`privacy.html`, `cookies.html`, `contact.html`, `grievance.html`, `terms.html`) as needed. The first line of every `index.html` is an HTML comment naming the check it exercises. `_routes.json` (optional) holds canned responses keyed `host/path` (status, headers, body), for redirects and special headers. Third-party content lives in `<fixture>/_hosts/<host>/` or, when shared, `_shared/<host>/`. Fake tracker scripts are tiny inline files that set a cookie and fetch a 1×1 image from the fake host.

| Fixture                                           | Exercises                                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clean/`                                          | No trackers, banner with equal reject, persistent settings link, all published items present. Must produce no findings; it is the negative for every check |
| `trackers-before-consent/`                        | W1, W2                                                                                                                                                     |
| `reject-ignored/`                                 | W3                                                                                                                                                         |
| `no-first-layer-reject/`                          | W4                                                                                                                                                         |
| `continue-means-consent/`                         | W5                                                                                                                                                         |
| `prechecked-box/`                                 | W6                                                                                                                                                         |
| `no-settings-link/`                               | W7                                                                                                                                                         |
| `session-replay-form/`                            | W8                                                                                                                                                         |
| `third-party-form/`                               | W9                                                                                                                                                         |
| `http-form/`                                      | W10 (scanned as `http://site.fixture.in/`; routing serves plain http like https)                                                                           |
| `get-form-email/`                                 | W11                                                                                                                                                        |
| `policy-complete/` and `policy-missing-items/`    | W12–W16                                                                                                                                                    |
| `policy-120-days/`                                | W14 (period published but above 90 days)                                                                                                                   |
| `redirect-to-private/`, `subresource-to-private/` | SSRF interception                                                                                                                                          |
| `redirect-chain/`                                 | Redirect limit: 5 hops load, 6 are refused                                                                                                                 |
| `redirect-other-domain/`                          | Landing site: the requested URL redirects to `www.moved-fixture.in`; pages, robots.txt and first party follow it                                           |
| `never-settles/`                                  | Page timeout: polls forever, never goes network-idle                                                                                                       |
| `slow-pages/`                                     | Scan budget: extra pages poll forever, so a short budget ends the scan as `scan-timeout`                                                                   |
| `meta-refresh-loop/`                              | Scan budget: two pages refresh to each other forever                                                                                                       |
| `download/`                                       | Downloads refused                                                                                                                                          |
| `robots-disallow/`                                | robots.txt honoured for extra pages, `skipped-robots` status                                                                                               |
| `bot-wall/`                                       | 403 with a challenge marker → `blocked-bot-wall`, partial                                                                                                  |
| `form-page-slot/`                                 | Free page slots (WS-3g): one policy link, then a form page and an other page; login and PDF links never used; W11 found on the form page                   |
| `storage-key-email/`                              | Exit-side redaction: a storage key named with an email address makes `runScan` throw `RedactionError` instead of returning the result                      |

**Rules.** No real personal data: `example.in` addresses and obviously fake names only. Redaction fixtures carry the sentinel `SECRET-VALUE-DO-NOT-RECORD` in a cookie value, a form value and page text, and tests assert it never appears in a result. Never copy markup from a real site.
