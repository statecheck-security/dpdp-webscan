# dpdp-webscan

[![CI](https://github.com/statecheck-security/dpdp-webscan/actions/workflows/ci.yml/badge.svg)](https://github.com/statecheck-security/dpdp-webscan/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/statecheck-security/dpdp-webscan?style=flat)](https://github.com/statecheck-security/dpdp-webscan/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-blue.svg)](.nvmrc)

The engine behind **DPDPA Website Check** ([statechecksecurity.com/scan](https://statechecksecurity.com/scan)). It loads a public website in headless Chromium and records what the site does before a visitor makes a choice: trackers and identifiers that load first, how the consent banner behaves on reject, what forms collect and where they send it, and whether the site publishes a privacy contact, a way to make rights requests and a grievance period.

Each finding points at the section of India's Digital Personal Data Protection Act, 2023 or the rule of the DPDP Rules, 2025 it engages, labelled **settled**, **likely** or **open**. There is **no score**, and no "compliant" verdict.

> **Not legal advice.** The engine reports what a site did on the pages it loaded, and the provision that behaviour engages. Whether that behaviour is lawful depends on the site's processing, its contracts and how the Data Protection Board reads the Rules. The provisions the checks engage take effect on 13 May 2027. Have your counsel or DPO review a report before acting on it.

**Status:** v1. All sixteen checks (W1–W16) and the information items are built and tested; engine `1.0.0`, catalogue `2026-11-04`. Scans for the website are run by hand in the Docker container below and sent to the website, which renders and emails the report. There is no hosted service; one is planned only when demand asks for it.

## Scope and non-goals

The engine does one thing: it observes a public site's behaviour toward a first-time visitor, in three states (no interaction, after reject, after accept), and reports the observations as check ids with evidence.

It does not:

- give a score, grade, rating or verdict, for a site or for a finding;
- read the text of a privacy notice for its content (it looks only for the published items W12–W16 name, in English);
- check anything that is not visible from the outside: internal systems, contracts, retention, data flows after a form is submitted;
- submit forms, log in, download files, or click anything but consent-banner controls;
- scan more than 5 pages, leave the site's registrable domain, or scan private addresses;
- store cookie or storage values, page HTML, page text, screenshots, or the names and addresses it reads on a page;
- run as a hosted service from this repository (`src/send.ts` posts a result to the StateCheck website; hosting a scan worker is out of scope).

## Where a finding's words come from

The engine emits check ids and evidence only. No string in `src/` is ever shown to a reader. The title, provision, label and fix for each check live in the StateCheck Security website's catalogue (`src/data/scan/` in [theAstiv/scs](https://github.com/theAstiv/scs)), where every sentence that cites the Act or the Rules is claim-checked before it is published. `CATALOGUE_VERSION` in [`src/checks.ts`](src/checks.ts) must equal the catalogue's version, and `CHECK_IDS` must equal its id list; `test/catalogueDrift.test.ts` compares them whenever the website repository is checked out beside this one (`../scs` or `SCS_PATH`), and skips with a note otherwise. The result carries both `engineVersion` and `catalogueVersion`, and the website refuses versions it does not know.

So a wording problem is a website issue, and a detection problem is an engine issue. [CONTRIBUTING.md](CONTRIBUTING.md) has the ground rules.

## What it checks

| Id  | What the engine looks for                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------ |
| W1  | Third-party trackers (analytics, ads, social, session replay, tag managers) loading before any choice              |
| W2  | Cookies and storage keys set before any choice, apart from the site's own session, security and consent-state ones |
| W3  | Trackers or identifiers that still appear after clicking reject                                                    |
| W4  | An accept control on the banner's first layer with no reject next to it                                            |
| W5  | Banner text that treats browsing as consent ("by continuing you agree")                                            |
| W6  | A consent-like checkbox on a form that is ticked before the visitor touches it                                     |
| W7  | No visible way to change the consent choice later, on the pages scanned                                            |
| W8  | A session-replay script on a page with a form that asks for personal data                                          |
| W9  | A personal-data form that submits to another company's host (payment gateways excepted)                            |
| W10 | A personal-data form on, or submitting to, plain `http`                                                            |
| W11 | A personal-data form sent by `GET`, so what the visitor types lands in the URL                                     |
| W12 | No contact for privacy questions found                                                                             |
| W13 | No way to make rights requests (access, correction, erasure, nomination) found                                     |
| W14 | No grievance response period found, or one longer than 90 days                                                     |
| W15 | No mention of complaining to the Data Protection Board found                                                       |
| W16 | No explanation of how to withdraw consent found                                                                    |

W12–W16 are absence findings: they say what we did not find on the pages we scanned, never that the site does not have it. They read English text only.

Information items, with no provision and no label: `banner` (seen or not, and its vendor), `site-cookies` (the session, security and consent-state cookies W2 leaves out), `third-party-locations` (third-party hosts that are not trackers), `notice-languages` (the `lang` attributes seen), `coverage` (the pages read, pages chosen but not loaded, and where each published item was found) and `consent-comparison` (trackers and identifier names that only appeared after accept, and after reject).

## How a scan runs

1. Load the requested page in a fresh browser context and record what it does before any interaction. If the page redirected to another domain, the scan follows the site it landed on.
2. Find the consent banner, read the page's forms and text, read `robots.txt`, and choose up to 4 more pages on the same site: policy pages first (privacy, cookies, contact, grievance, terms), then a likely form page and other links.
3. If there is a banner: in a fresh context, click reject (opening the settings layer if reject is not on the first layer) and record what happens after the click.
4. Visit the extra pages, honouring `robots.txt` for them.
5. If there is a banner: in a fresh context, click accept.
6. Run the checks and assert the result holds no values before returning it.

Limits: 5 pages, 20 s per page (at most 5 s of that waiting for the network to go quiet), 90 s per scan, at most 2 clicks per run. A timeout, a bot-protection page or a blocked request marks the scan `partial` with a reason, and whatever was collected is still reported.

## What it never does

- Submit a form, log in, or click anything except consent-banner controls. A banner drawn in an iframe is clicked only when the frame comes from a known consent platform's domain or the site itself; other frames are never searched or clicked.
- Crawl more than 5 pages, or leave the site's registrable domain.
- Store cookie or storage values, page HTML, page text, screenshots, or names and addresses it reads on a page. Quotes (W5, W14) are at most 25 words, with emails and phone numbers masked.
- Scan private or internal addresses.
- Give a score.

[SECURITY.md](SECURITY.md) describes the SSRF and egress defences behind these promises, and how to report a way round them.

## How this compares

Several open-source tools look at what a website does to a visitor. The differences are in what they interact with, what they store, and whose law they speak.

| Tool                                                                                      | Consent states                                              | Legal framing                                                   | What it keeps                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| **dpdp-webscan**                                                                          | None, after reject, after accept; up to 5 pages             | DPDP Act 2023 and Rules 2025, settled / likely / open, no score | Names and hostnames only; values never leave the engine |
| [Blacklight](https://github.com/the-markup/blacklight-collector) (The Markup)             | No banner interaction                                       | None; a tracker inventory (ads, session replay, fingerprinting) | Full inspection data                                    |
| [EDPS Website Evidence Collector](https://code.europa.eu/edps/website-evidence-collector) | No banner interaction by default; scripted actions possible | GDPR and ePrivacy evidence for a regulator's inspection         | Evidence pack with screenshots and HAR files            |
| [Vettam dpdp-compliance-scanner](https://github.com/Vettam/dpdp-compliance-scanner)       | Single page; captures the banner                            | DPDP Act and Rules, legal certainty rather than severity        | Inventory of cookies, storage, requests and embeds      |
| [gdpr-cookie-scanner](https://github.com/Slashgear/gdpr-cookie-scanner) (Slashgear)       | Reject and accept runs                                      | GDPR, with letter grades and an exit code for CI                | Cookie inventory and screenshots                        |
| [consenti](https://github.com/santoshe61/consenti)                                        | None, reject, accept                                        | GDPR, undeclared trackers                                       | Tracker inventory                                       |

Blacklight's detection list is the benchmark for tracker inventories; it does not click banners and has no legal mapping. The EDPS collector is the regulator-grade evidence tool for European inspections and keeps everything, which is the opposite of this engine's redaction rule. Vettam's scanner maps a single page's collection to the DPDP Act with the same no-verdict stance as this engine, and says it does not check the published notice's text; the reject path (W3–W5) and the published items (W12–W16) are what this engine adds. consenti's three-state crawl (none, reject, accept) is the same idea this engine already runs on every scan; the difference is the DPDP mapping and that this engine records names rather than values.

## Use

```bash
npm ci
npm run browsers                                   # once, for local development and tests
npm run scan:docker -- https://example.in          # writes results/<host>-<time>.json
npm run scan:send -- <requestId> results/<file>.json
```

Run real scans only with `scan:docker`, never with a bare browser on your own network (see below). `npm run scan -- <url>` runs the same CLI without the container and is for development.

`scan:send` posts a reviewed result to the website's `/api/scan-result`, signed with an HMAC. It reads `SCAN_RESULT_URL` and `SCAN_HMAC_SECRET` from the environment (keys listed in `.env.example`); nothing loads `.env` for you, so either export them in your shell or run:

```bash
node --env-file=.env --import tsx src/send.ts <requestId> results/<file>.json
```

Result files name other companies' sites. `results/` is gitignored; delete a result once its report has been sent.

## The result file

One JSON object per scan:

- `engineVersion`, `catalogueVersion`: the website refuses versions it does not know (it accepts engine `1.0.x` with catalogue `2026-11-04`, and `0.9.x` with `2026-10-25-r2` for results scanned before 1.0.0), so a minor engine bump needs a matching website change.
- `target`, `startedAt`, `finishedAt` (ISO 8601 UTC).
- `partial` and `partialReasons`: `page-timeout`, `scan-timeout`, `bot-wall`, `ssrf-blocked`, `banner-not-found`, `navigation-error`.
- `pages`: every page tried, with why it was chosen and what happened (`loaded`, `skipped-robots`, `blocked-bot-wall`, …); `settled: false` marks a page still loading when it was read, and `coverage` lists pages chosen but never loaded (`pagesSkipped`).
- `findings`: `{ id, evidence }` for W1–W16, in id order.
- `info`: the information items above.

Evidence holds hostnames (never full URLs with query strings) with the vendor and, when known, the country its company is based in (from the vendor's own legal pages; `src/data/vendorCountries.ts`, information only), cookie and storage names, form field types and names (every offending form, at most 5 per finding; W11 adds the page's referrer policy when it sets one), page URLs and short quotes. One exception to "hostnames only": on Google tag hosts the engine reads Google Consent Mode's `gcs` code and keeps only whether it said "denied" (`consentDenied`), never the code or the rest of the URL. Before a result leaves the engine, `assertRedacted` walks it and refuses anything value-shaped: a long `name=value` token, an email address, an over-long string, or a score-like key. `scan:send` checks again, in case the file was edited.

## Docker (egress-restricted scans)

Every real scan runs in a container whose kernel rejects traffic to private, loopback, link-local (including cloud metadata `169.254.169.254`), CGNAT, multicast and reserved addresses: the same ranges `src/guard.ts` refuses. The app-level guard alone can be beaten by DNS rebinding; these rules cannot be changed from inside the scan.

```bash
npm run scan:docker -- https://example.in    # build if needed, scan, write results/<host>-<time>.json
npm run scan:docker:selftest                 # egress self-test, makes no public request
```

How it works:

- `docker/Dockerfile` builds on `mcr.microsoft.com/playwright:v<version>-noble`; the tag must equal the Playwright version in `package-lock.json` (a unit test checks).
- `docker/egress.sh` is the entrypoint. As root it allows loopback (the engine's per-context egress proxy listens on `127.0.0.1`; Docker's DNS is `127.0.0.11`), then installs `iptables`/`ip6tables` `OUTPUT` REJECT rules for every range, plus all IPv6 outside `2000::/3`. If any rule fails it exits non-zero and the scan never starts. It then drops to the unprivileged `pwuser` with no capabilities and `no_new_privs`, so nothing in the scan can flush the rules. `test/egress.test.ts` fails if its ranges drift from `src/guard.ts`.
- `docker/compose.yml` adds `NET_ADMIN` (only for `egress.sh`), a 2 GB memory cap, 512 processes, a read-only root with `/tmp` as tmpfs (`HOME=/tmp`), and mounts `./results`. It points Docker's DNS at public resolvers, because on Docker Desktop the default upstream is a private address the rules reject. No `.env` or secret goes into the image (`.dockerignore` admits only `package*.json`, `tsconfig.json`, `src/` and the two scripts); `scan:send` runs on the host.

The self-test runs as the scan user and passes only if `curl` to `169.254.169.254`, `10.0.0.1`, `172.16.0.1`, `192.168.1.1`, `100.64.0.1`, `fd00::1` and `fe80::1` fails at once with "couldn't connect", `iptables -F` is refused, the process has no capabilities, and loopback works. CI runs it on every push (`docker` job). Without the rules, the same IPv4 probes time out instead of being rejected.

On Linux hosts the bind-mounted `results/` must be writable by uid 1001 (`pwuser`); Docker Desktop on Windows and macOS needs nothing.

## Development

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # tsc + eslint
npm run format:check   # prettier (npm run format fixes)
npm run test:unit      # fast tests
npm run test:browser   # *.browser.test.ts, needs `npm run browsers` once
npm test               # everything
```

Tests never touch the network: browser tests route every request to local fixture sites (`fixtures/README.md`). Checks are pure functions over captured data (`src/checks/`), so each has a unit test from a hand-built context as well as a fixture scan. No rule, fixture, snapshot or test names or matches a real site; the only real target this repository names is statechecksecurity.com.

The tracker, consent-platform and vendor-country lists in `src/data/` are kept by hand from the vendors' own published pages, each entry with its source. They do not include, and are not derived from, DuckDuckGo Tracker Radar, the Disconnect list or the Ghostery tracker database.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the ground rules and the pull request checklist, and [CHANGELOG.md](CHANGELOG.md) for what each release changed.

## Related tools

- **[dpdp-scan](https://github.com/statecheck-security/dpdp-scan)**: the source-code scanner. It finds Indian identifiers (Aadhaar, PAN, GSTIN, UPI, IFSC, mobile) in code, fixtures and logs with real checksums, and reads SQL, Prisma and OpenAPI schemas into a data inventory. A different tool for a different surface; the two share only the findings model.
- **[dpdpa-engineering-kit](https://github.com/statecheck-security/dpdpa-engineering-kit)**: tested code for the obligations behind the findings: consent records, breach notification, encryption, data residency and CI/CD privacy gates.

## Licence

[Apache License 2.0](LICENSE). Keep the [NOTICE](NOTICE) file with any redistribution.

## About

Maintained by [StateCheck Security](https://statechecksecurity.com), which does VAPT, source code review, threat modelling and DPDPA compliance work for Indian companies. Questions and fixes are welcome as issues or pull requests. To report a security problem in the engine, see [SECURITY.md](SECURITY.md).

Not legal advice. The provisions take effect on 13 May 2027.
