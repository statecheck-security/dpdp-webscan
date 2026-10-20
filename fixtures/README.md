# Fixture sites

Local static pages the engine is tested against (plan WS-8). `test/fixtures.ts` serves each folder from `node:http` on an ephemeral port and routes every browser request to it through Playwright, so tests never touch the internet.

**Hosts.** The scanned site is `https://site.fixture.in`; fake third parties are `tracker.fixture.in`, `replay.fixture.in`, `forms.fixture.in` and `cmp.fixture.in`. They end in `.in` so `src/guard.ts` accepts them unchanged (it blocks `.test`, `.example` and `.local`; never weaken it for a fixture). A fake resolver returns a public address and the route handler fulfils every request locally, so no packet leaves the machine.

**Layout.** One folder per fixture, `index.html` first, extra pages (`privacy.html`, `cookies.html`, `contact.html`, `grievance.html`, `terms.html`) as needed. The first line of every `index.html` is an HTML comment naming the check it exercises. Fake tracker scripts are tiny inline files that set a cookie and fetch a 1×1 image from the fake host.

| Fixture | Exercises |
|---|---|
| `clean/` | No trackers, banner with equal reject, persistent settings link, all published items present. Must produce no findings; it is the negative for every check |
| `trackers-before-consent/` | W1, W2 |
| `reject-ignored/` | W3 |
| `no-first-layer-reject/` | W4 |
| `continue-means-consent/` | W5 |
| `prechecked-box/` | W6 |
| `no-settings-link/` | W7 |
| `session-replay-form/` | W8 |
| `third-party-form/` | W9 |
| `http-form/` | W10 (served over plain http by a second fixture server) |
| `get-form-email/` | W11 |
| `policy-complete/` and `policy-missing-items/` | W12–W16 |
| `policy-120-days/` | W14 (period published but above 90 days) |
| `redirect-to-private/`, `subresource-to-private/` | SSRF interception |
| `robots-disallow/` | robots.txt honoured for extra pages, `skipped-robots` status |
| `bot-wall/` | 403 with a challenge marker → `blocked-bot-wall`, partial |

**Rules.** No real personal data: `example.in` addresses and obviously fake names only. Redaction fixtures carry the sentinel `SECRET-VALUE-DO-NOT-RECORD` in a cookie value, a form value and page text, and tests assert it never appears in a result. Never copy markup from a real site.
