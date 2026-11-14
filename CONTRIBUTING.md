# Contributing to dpdp-webscan

Thank you for your interest in dpdp-webscan, the engine behind the **DPDPA Website Check**
at [statechecksecurity.com/scan](https://statechecksecurity.com/scan). It reports what a
public website does before a visitor makes a choice, mapped to India's **Digital Personal
Data Protection Act, 2023** and the **DPDP Rules, 2025**.

Contributions from engineers, privacy engineers, security researchers and legal engineers
are welcome.

---

## Code of Conduct

All contributors and participants are expected to adhere to the
[Code of Conduct](CODE_OF_CONDUCT.md). Please treat everyone with respect, professionalism
and empathy.

---

## Ground rules

These are not negotiable; a pull request that breaks one is asked to change before review.

1. **No score.** Nothing the engine emits, and nothing in this repository, gives a score,
   grade, severity, rating or "compliant" verdict. `test/noScore.test.ts` enforces it on
   `src/`; `assertRedacted` enforces it on every result at runtime.
2. **Words live in the website, not here.** The engine emits check ids and evidence only.
   The title, provision, label and fix a reader sees for each check live in the StateCheck
   Security website's catalogue (`src/data/scan/` in
   [theAstiv/scs](https://github.com/theAstiv/scs)), where they are reviewed in one place.
   If a sentence a user would read appears in this repository, it is in the wrong
   repository. Changing what a finding _says_ is a website change, not an engine change.
3. **Legal wording is reviewed, not improvised.** Any text that cites a section of the Act
   or a Rule, in code comments, commit messages, docs or templates, states the exact
   provision (`S.6(4)`, `Rule 14(3)`) and never a paraphrase of what the law "requires".
   Such text is claim-checked against the notified texts with the legal-accuracy check used
   across StateCheck's DPDPA material (`npm run check:legal` in the statecheck-docs
   repository) before it is merged; expect wording changes.
4. **Never submit a form, log in, or click anything except consent-banner controls.** At
   most 5 pages, same registrable domain only, 20 s per page, 90 s per scan.
5. **Never store values.** Cookie and storage _names_ only; form field _types and names_
   only; no page HTML, no screenshots, no page text, no names or addresses read from a
   page; third parties as hostnames, never full URLs. The one named exception (Google
   Consent Mode's "denied" flag) is documented in `src/consentMode.ts`.
6. **Never weaken the guard.** Every target goes through `src/guard.ts` and the egress
   proxy in `src/egress.ts`. Do not add a code path that lets a browser context talk to
   the network without the proxy, and do not loosen the guard to make a test site work:
   fixtures use `*.fixture.in` hosts with a fake resolver instead (`fixtures/README.md`).
7. **No real site, ever.** No rule, fixture, snapshot, test, issue or doc may name or match
   one real site. Fixture sites are made up; the only real target this repository names is
   statechecksecurity.com. Never paste a real scan result anywhere.
8. **Tests never touch the network.** Every browser test routes all requests to local
   fixture servers.
9. **Tracker lists stay hand-kept.** `src/data/trackers.ts`, `src/data/cmps.ts` and
   `src/data/vendorCountries.ts` are written from the vendors' own published pages, each
   entry with its source. Do not bundle or derive from DuckDuckGo Tracker Radar, the
   Disconnect list or the Ghostery tracker database (their licences do not allow it here).
   Never fill in a vendor's country from memory.
10. **A new runtime dependency needs a written reason** in the pull request. Dev
    dependencies that serve lint, test or format are fine.

---

## Development setup

### Prerequisites

- Node.js 22 or later (`.nvmrc`)
- Docker, only for `npm run scan:docker` and the egress self-test

### Clone and install

```bash
git clone https://github.com/statecheck-security/dpdp-webscan.git
cd dpdp-webscan
npm ci
npm run browsers        # installs Chromium for Playwright, once
```

### Quality gates

Before pushing, and again before opening a pull request:

```bash
npm run lint            # tsc --noEmit + eslint
npm run format:check    # prettier (npm run format fixes)
npm run test:unit       # fast tests
npm run test:browser    # fixture-site scans in Chromium
```

`npm test` runs everything. CI runs the same four plus the Docker egress self-test.

### Scanning a site while developing

Run real scans only through the container, never with a bare browser on your own network:

```bash
npm run scan:docker -- https://example.in
```

Results land in `results/`, which is gitignored because each file names another
company's site. Delete them when you are done.

---

## Pull request guidelines

1. **Fork and branch** from `main` (`feature/`, `fix/`, `test/`, `docs/`, `chore/`).
2. **One change per pull request**, with
   [Conventional Commits](https://www.conventionalcommits.org/) messages: `feat(w3): …`,
   `fix(guard): …`, `test(fixtures): …`. The subject is imperative and at most 72
   characters; the body says _why_.
3. **Tests.** A new or changed check gets a unit test from a hand-built `CheckContext` and
   a fixture scan; `fixtures/clean` stays its negative. A guard or egress change gets a
   test that proves the blocked case is still blocked.
4. **Versioning.** `ENGINE_VERSION` in `src/types.ts` follows semver and is bumped in the
   same pull request as any change to the result shape or a detection rule. The website
   refuses engine versions it does not know, so a minor or major bump needs a matching
   website change; say so in the description. `CATALOGUE_VERSION` in `src/checks.ts` is
   owned by the website and only copied here.
5. **Sign off your commits** (`git commit -s`): the
   [Developer Certificate of Origin](https://developercertificate.org/) is how you confirm
   you have the right to contribute the code under Apache-2.0. Pull requests without a
   sign-off are asked to add one before review.
6. **Expect a review of the legal text and the fixtures.** Maintainers check every cited
   provision (rule 3) and every host a fixture or rule names (rule 7).

---

## Reporting a security problem

See [SECURITY.md](SECURITY.md). Anything that lets the engine reach a non-public address,
leave the target's domain, or carry a value out in a result is a security bug: report it
privately, not as an issue.
