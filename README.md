# dpdp-webscan

The engine behind **DPDPA Website Check** (`statechecksecurity.com/scan`). It loads a public website in headless Chromium and records what the site does before a visitor makes a choice: trackers and identifiers that load first, how the consent banner behaves on reject, what forms collect and where they send it, and whether the site publishes a privacy contact, a way to make rights requests and a grievance period.

Each finding points at the section of the Digital Personal Data Protection Act, 2023 or the DPDP Rules, 2025 it engages, labelled **settled**, **likely** or **open**. There is **no score**, and no "compliant" verdict.

**Status:** scaffold. The URL guard and result signing work and are tested; the scan itself is not built yet. See [`.claude/scan-tool.md`](.claude/scan-tool.md) for the plan.

## What it never does

- Submit a form, log in, or crawl more than 5 pages.
- Store cookie or storage values, page HTML, screenshots, or names and addresses it reads on a page.
- Scan private or internal addresses.
- Give a score.

## Use (once built)

```bash
npm install
npm run browsers
npm run scan -- https://example.in
npm run scan:send -- <requestId> results/<file>.json
```

Run scans inside the egress-restricted Docker network (planned), never with a bare browser on your own network.

## Development

```bash
npm run typecheck
npm test
```

Not legal advice. The provisions take effect on 13 May 2027.
