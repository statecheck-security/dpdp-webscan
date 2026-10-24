# dpdp-webscan

The engine behind **DPDPA Website Check** (`statechecksecurity.com/scan`). It loads a public website in headless Chromium and records what the site does before a visitor makes a choice: trackers and identifiers that load first, how the consent banner behaves on reject, what forms collect and where they send it, and whether the site publishes a privacy contact, a way to make rights requests and a grievance period.

Each finding points at the section of the Digital Personal Data Protection Act, 2023 or the DPDP Rules, 2025 it engages, labelled **settled**, **likely** or **open**. There is **no score**, and no "compliant" verdict.

**Status:** scaffold. The URL guard and result signing work and are tested; the scan itself is not built yet. The build plan is kept outside the repo.

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

Run real scans inside the egress-restricted container (below), never with a bare browser on your own network.

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
npm run lint           # tsc + eslint
npm run test:unit      # fast tests
npm run test:browser   # *.browser.test.ts, needs `npm run browsers` once
npm test               # everything
```

Tests never touch the network: browser tests route every request to local fixture servers (`fixtures/README.md`).

Not legal advice. The provisions take effect on 13 May 2027.
