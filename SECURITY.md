# Security policy

## What this engine does, and what it must never do

dpdp-webscan drives a headless browser at a public website that someone else owns, on a
request from a third party. Two things can go wrong with such a tool, and the engine is
built to prevent both: it could be pointed at something it should not reach (a private
network, a cloud metadata endpoint, a site that asked not to be scanned), and it could
carry away more than it needs (cookie values, form contents, page text, the names and
addresses it reads). Anything that weakens either guarantee is a security bug.

### Reaching only public sites (SSRF and egress)

- **Target validation.** A target is accepted only as `http` or `https` on port 80 or 443,
  with no userinfo, no IP literal in any form (dotted, decimal, octal, hex, IPv4-mapped
  IPv6) and no non-public name (`localhost`, `.local`, `.internal`, `.test`, `.example`).
  Its name is resolved first, and every address must be public: private, loopback,
  link-local (including the cloud metadata address `169.254.169.254`), carrier-grade NAT
  (`100.64.0.0/10`), multicast, reserved, unique-local (`fc00::/7`) and `fe80::/10` ranges
  are refused. See `src/guard.ts`.
- **Every request, every hop.** Each browser context sends all of its traffic through its
  own egress proxy on `127.0.0.1` (`src/egress.ts`). The proxy runs the same guard on every
  plain-http request and every CONNECT tunnel, redirect hops included, and dials the
  address it validated rather than letting the browser resolve the name again, which
  closes DNS rebinding at the application layer. A Playwright route handler is a fast
  first-hop check on top. Redirect chains are capped at 5. WebRTC's non-proxied UDP is
  turned off because it would bypass the proxy.
- **Network-layer rules as well.** Application checks alone are not enough, so every real
  scan runs in the Docker container in `docker/`, whose entrypoint installs `iptables` and
  `ip6tables` OUTPUT REJECT rules for the same ranges before dropping to an unprivileged
  user with no capabilities and `no_new_privs`. If a rule fails to install the scan never
  starts. `npm run scan:docker:selftest` proves the rules hold; CI runs it on every push.
  `test/egress.test.ts` fails if the container's ranges drift from `src/guard.ts`.
- **Browser hardening.** Fresh context per run, no persistent profile, downloads refused,
  service workers blocked, no permission prompts granted, a memory cap, and the whole
  process tree killed on timeout.
- **Budgets.** 5 pages, 20 seconds per page, 90 seconds per scan, at most 2 clicks per run.
  A bot-protection page is recorded as `blocked-bot-wall` and the scan stops; the engine
  never retries, never rotates anything, and identifies itself with a user-agent suffix
  (`StateCheckScan/1 (+https://statechecksecurity.com/scan)`) so site owners can see it.

### What the engine will not scan or do

- Private or internal addresses, in any form (above).
- More than 5 pages, or any page outside the registrable domain the scan landed on.
- Any page `robots.txt` disallows, apart from the one page the requester asked for, which
  is loaded like a single visit.
- It never submits a form, logs in, downloads a file, or clicks anything except
  consent-banner controls, and it clicks inside an iframe only when that frame comes from
  a known consent platform's domain or from the site itself.
- It never records cookie or storage values, page HTML, page text, screenshots, form
  contents, or the names and addresses it reads on a page. Quotes are at most 25 words,
  with emails and phone numbers masked. Third parties are recorded as hostnames, never
  full URLs. `assertRedacted` walks every result before it leaves the engine and refuses
  anything value-shaped; a test smuggles a sentinel through a cookie value, a form value
  and page text and asserts it never reaches the output.
- It never produces a score, grade or verdict.

The hosted service at statechecksecurity.com adds rate limits per address, email and
domain, an honest-use review before any scan runs, and a published opt-out for site owners
who do not want their domain scanned. Those live in the website's code, not here.

## Reporting a vulnerability

If you find a way to make the engine reach a non-public address, leave the target's
domain, click something it should not, or carry a value out in a result or a log, please
do not open a public issue. Use the contact form at <https://statechecksecurity.com/#contact>
(or the email address published there) with the version, how to reproduce it against a
local fixture site (see `fixtures/README.md`), and what you saw. Do not include a real
site's scan output or any real personal data in the report.

We acknowledge within three working days and aim to fix guard, egress and redaction bugs
in the next release.

## Supported versions

Only the latest `1.x` release receives fixes.
