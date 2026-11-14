# Changelog

All notable changes to dpdp-webscan. Dates are UTC. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Pull request numbers refer to
the repository's history before it was published.

## [1.0.0] - 2026-11-04

First public release: engine `1.0.0` against the website catalogue of `2026-11-04`. The
engine emits check ids and evidence only; every word a reader sees lives in the website's
catalogue.

### Added

- Engine foundation: repository hygiene, CI, a hardened Chromium context and a
  per-context egress proxy that re-checks every hop (#1).
- Capture of third-party hosts, cookie names and storage keys, never values (#2).
- Same-site page discovery and `robots.txt` handling (#3), and the orchestrator that runs
  baseline, extra pages and result assembly (#4); free page slots filled with a form page
  and other pages (#12).
- Hand-kept tracker list and checks W1 and W2 (#5); consent banner handling and checks
  W3, W4, W5 and W7 (#7); form inspection and checks W6 and W8 to W11 (#8); page text
  and the absence checks W12 to W16 (#9).
- Egress-restricted Docker container: kernel rules for every private, loopback,
  link-local, CGNAT, multicast and reserved range, a self-test, and a CI job that runs it
  (#6).
- Information items and `assertRedacted`, which walks every result before it leaves the
  engine and refuses anything value-shaped (#10); the `site-cookies` item, with trackers
  taken out of the third-party list (#14).
- Vendor countries, from each vendor's own legal pages, recorded next to the vendor name
  (#23).
- Every offending form listed, at most five per finding, and W11's referrer facts (#24).
- The `consent-comparison` item: trackers and identifiers that only appeared after accept,
  and after reject (#25).
- Pages still loading when read flagged `settled: false`, and pages chosen but never loaded
  listed under `coverage.pagesSkipped` (#26).
- Google Consent Mode requests marked "denied" recorded as `consentDenied`, keeping only
  that flag and nothing else of the URL (#27).

### Changed

- Catalogue matched to the website's `2026-10-25` (#11, #13) and `2026-10-25-r2` (#15)
  versions, then `2026-11-04` for 1.0.0 (#28, #29).
- Six v0 review fixes: the idle wait capped at 5 s, the accept run last, a re-base on a
  cross-domain landing site, a recorded-URL rule, masked quotes, and W14's response period
  (#16).
- The `robots.txt` fetch page kept out of the capture; Laravel `<app>_session` cookies
  treated as site cookies (#17).
- The egress proxy dials every validated address and times out hung upstreams, with a
  256-tunnel cap (#19).
- Banner handling: links away from the banner are no longer read as settings; a wait for
  banners drawn late (#20); banners drawn in a consent platform's iframe are found and
  clicked, and no other frame is ever searched (#21).
- W8 also reads the accept run; Sourcepoint, Funding Choices and consensu.org classed as
  consent platforms (#22).
- README describes the v0 engine (#18), then v1 (#29).

[1.0.0]: https://github.com/statecheck-security/dpdp-webscan/releases/tag/v1.0.0
