---
name: Bug report
about: A check fires when it should not, misses what it should find, or the engine misbehaves
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the engine did and what you expected instead.

**Which check or module**

- Check id (W1 to W16) or information item, if any:
- Module (e.g. `banner.ts`, `forms.ts`, `guard.ts`, `docker/`):

**To reproduce**
Please reproduce it against a local fixture site (see `fixtures/README.md`), a site you
own, or statechecksecurity.com. Do not name another company's site, and do not attach a
real scan result: evidence from a result file about a site you do not own stays private.

1. Fixture or page markup that triggers it (a minimal `index.html` is ideal):
2. Command run (`npm run scan -- …`, `npm run test:browser`, …):
3. What happened (the relevant `findings` or `info` entry, with any hostnames you do not
   own replaced by `third-party.example`):

**Expected behaviour**
A clear description of what you expected to happen.

**Environment**

- Engine version (`engineVersion` in the result, or `ENGINE_VERSION` in `src/types.ts`):
- OS and Node.js version:
- Run inside the Docker container? (yes / no)
