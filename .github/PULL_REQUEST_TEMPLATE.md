## Description

Brief summary of the change and why it is needed.

## What it touches

- [ ] A check (`src/checks/`): which id (W1 to W16)?
- [ ] Capture, pages, banner, forms or text (browser code)
- [ ] Guard or egress (`src/guard.ts`, `src/egress.ts`, `docker/`)
- [ ] Data tables (`src/data/`): trackers, consent platforms, vendor countries, suffixes
- [ ] Result shape (`src/types.ts`, `src/result.ts`)
- [ ] Docs, CI or tooling only

## Verification checklist

- [ ] `npm run lint`, `npm run format:check` and `npm test` pass.
- [ ] A changed or new check has a unit test from a hand-built `CheckContext` and a fixture
      scan, and `fixtures/clean` still produces no findings.
- [ ] `ENGINE_VERSION` is bumped if the result shape or a detection rule changed, and the
      description says whether the website needs a matching change.
- [ ] No rule, fixture, snapshot, test or doc names or matches a real site; no real scan
      output anywhere in the change.
- [ ] Nothing new is stored as a value: cookie and storage names only, form field types and
      names only, hostnames only, no page text.
- [ ] No score, grade, severity, rating or "compliant" verdict anywhere.
- [ ] Every cited section or Rule is exact, and the wording has been claim-checked (see
      CONTRIBUTING.md, ground rule 3).
- [ ] Any new data-table entry cites the vendor's own published page as its source.
- [ ] Commits are signed off (`git commit -s`, Developer Certificate of Origin).
