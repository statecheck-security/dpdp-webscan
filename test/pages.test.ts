// WS-3c: same-site rules (registrable domain from the hand-kept suffix list).
import { describe, expect, it } from 'vitest';
import { registrableDomain, sameSite } from '../src/pages.js';

describe('registrableDomain', () => {
  it.each([
    ['statechecksecurity.com', 'statechecksecurity.com'],
    ['www.statechecksecurity.com', 'statechecksecurity.com'],
    ['a.b.c.example.in', 'example.in'],
    ['www.example.co.in', 'example.co.in'],
    ['portal.dept.gov.in', 'dept.gov.in'],
    ['co.in', 'co.in'],
    ['shop.example.co.uk', 'example.co.uk'],
    ['someone.github.io', 'someone.github.io'],
    ['preview.my-app.vercel.app', 'my-app.vercel.app'],
    ['svc.up.railway.app', 'svc.up.railway.app'],
    ['WWW.Example.IN', 'example.in'],
    ['www.example.in.', 'example.in'],
    ['.example.in', 'example.in'],
    ['localhost', 'localhost'],
    ['93.184.215.14', '93.184.215.14'],
    ['[2606:2800:220:1::1]', '2606:2800:220:1::1'],
    ['site.fixture.in', 'fixture.in'],
    ['tracker-fixture.in', 'tracker-fixture.in'],
  ])('%s → %s', (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });
});

describe('sameSite', () => {
  const target = new URL('https://www.example.co.in/');
  it.each([
    ['https://example.co.in/privacy', true],
    ['http://help.example.co.in/contact', true],
    ['https://other.co.in/', false],
    ['https://example.in/', false],
    ['mailto:privacy@example.co.in', false],
    ['ftp://example.co.in/', false],
  ])('%s → %s', (url, expected) => {
    expect(sameSite(new URL(url), target)).toBe(expected);
  });

  it('keeps tenants of a hosting platform apart', () => {
    expect(sameSite(new URL('https://b.vercel.app/'), new URL('https://a.vercel.app/'))).toBe(false);
  });
});
