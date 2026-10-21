// WS-3c: same-site rules (registrable domain from the hand-kept suffix list).
// WS-3d: choosing the extra pages, and robots.txt.
import { describe, expect, it } from 'vitest';
import { parseRobots, pickPages, registrableDomain, robotsAllows, robotsPolicy, sameSite } from '../src/pages.js';
import type { PageLink } from '../src/pages.js';

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

describe('pickPages', () => {
  const target = new URL('https://www.example.co.in/');
  const link = (href: string, text = ''): PageLink => ({ href, text });

  it('picks one page per kind, in priority order, at most 4', () => {
    const links = [
      link('https://www.example.co.in/terms', 'Terms and Conditions'),
      link('https://www.example.co.in/contact', 'Contact'),
      link('https://www.example.co.in/grievance', 'Grievances'),
      link('https://www.example.co.in/cookie-policy', 'Cookies'),
      link('https://www.example.co.in/privacy', 'Privacy Policy'),
    ];
    expect(pickPages(links, target)).toEqual([
      { url: 'https://www.example.co.in/privacy', reason: 'privacy' },
      { url: 'https://www.example.co.in/cookie-policy', reason: 'cookies' },
      { url: 'https://www.example.co.in/contact', reason: 'contact' },
      { url: 'https://www.example.co.in/grievance', reason: 'grievance' },
    ]);
  });

  it('fills a free slot with terms when a kind is missing', () => {
    const links = [
      link('https://www.example.co.in/privacy', 'Privacy'),
      link('https://www.example.co.in/terms', 'Terms'),
    ];
    expect(pickPages(links, target).map((p) => p.reason)).toEqual(['privacy', 'terms']);
  });

  it('prefers link text over a path match, and falls back to the path', () => {
    const links = [
      link('https://www.example.co.in/privacy-old', 'Archive'),
      link('https://www.example.co.in/p/42', 'Your privacy'),
      link('https://www.example.co.in/support/contact-form', 'Write to us'),
    ];
    expect(pickPages(links, target)).toEqual([
      { url: 'https://www.example.co.in/p/42', reason: 'privacy' },
      { url: 'https://www.example.co.in/support/contact-form', reason: 'contact' },
    ]);
  });

  it('never uses one page for two kinds', () => {
    const links = [
      link('https://www.example.co.in/privacy', 'Privacy and cookie policy'),
      link('https://www.example.co.in/cookies', 'Cookies'),
    ];
    expect(pickPages(links, target)).toEqual([
      { url: 'https://www.example.co.in/privacy', reason: 'privacy' },
      { url: 'https://www.example.co.in/cookies', reason: 'cookies' },
    ]);
  });

  it('ignores the target itself, anchors, other sites, non-web links and duplicates; drops query and hash', () => {
    const links = [
      link('https://www.example.co.in/#privacy', 'Privacy'),
      link('https://www.example.co.in/', 'Privacy'),
      link('https://policies.partner.com/privacy', 'Privacy'),
      link('mailto:privacy@example.co.in', 'Privacy'),
      link('javascript:void(0)', 'Privacy'),
      link('not a url', 'Privacy'),
      link('https://example.co.in/privacy?utm_source=footer#top', 'Privacy'),
      link('https://www.example.co.in/privacy', 'Privacy'),
      link('https://help.example.co.in/contact', 'Contact'),
    ];
    expect(pickPages(links, target)).toEqual([
      { url: 'https://example.co.in/privacy', reason: 'privacy' },
      { url: 'https://help.example.co.in/contact', reason: 'contact' },
    ]);
  });

  it('returns nothing when no link matches', () => {
    expect(pickPages([link('https://www.example.co.in/shop', 'Shop')], target)).toEqual([]);
  });
});

describe('robots.txt', () => {
  it('groups consecutive User-agent lines and ignores comments, other fields and empty Disallow', () => {
    const text = [
      '# comment',
      'User-agent: Googlebot',
      'User-agent: StateCheckScan # us',
      'Disallow: /private',
      '',
      'User-agent: *',
      'Disallow:',
      'Crawl-delay: 10',
      'Sitemap: https://example.in/sitemap.xml',
    ].join('\r\n');
    expect(parseRobots(text)).toEqual([
      { agents: ['googlebot', 'statecheckscan'], rules: [{ allow: false, pattern: '/private' }] },
      { agents: ['*'], rules: [] },
    ]);
  });

  it('starts a new group when a User-agent follows a rule', () => {
    const groups = parseRobots('User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y');
    expect(groups.map((g) => g.agents)).toEqual([['a'], ['b']]);
  });

  const star = 'User-agent: *\nDisallow: /contact\nDisallow: /*.pdf$\nDisallow: /shop\nAllow: /shop/privacy\n';
  it.each([
    ['/contact', false],
    ['/contact-us', false],
    ['/Contact', true],
    ['/privacy', true],
    ['/docs/policy.pdf', false],
    ['/docs/policy.pdf?x=1', true],
    ['/shop/cart', false],
    ['/shop/privacy', true],
    ['/', true],
  ])('* group: %s → %s', (path, allowed) => {
    expect(robotsAllows(parseRobots(star), path)).toBe(allowed);
  });

  it('uses our own group instead of *, and allows everything with no group', () => {
    const text = 'User-agent: *\nDisallow: /\n\nUser-agent: statecheckscan\nDisallow: /contact\n';
    expect(robotsAllows(parseRobots(text), '/privacy')).toBe(true);
    expect(robotsAllows(parseRobots(text), '/contact')).toBe(false);
    expect(robotsAllows(parseRobots('User-agent: other\nDisallow: /'), '/privacy')).toBe(true);
    expect(robotsAllows([], '/privacy')).toBe(true);
  });

  it('lets Allow win a tie of equal length', () => {
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /page\nAllow: /page'), '/page')).toBe(true);
  });

  it('treats a missing robots.txt as allow-all and an unreachable one as disallow-all (RFC 9309)', () => {
    const url = new URL('https://example.in/contact');
    expect(robotsPolicy({ status: 'absent' })(url)).toBe(true);
    expect(robotsPolicy({ status: 'unreachable' })(url)).toBe(false);
    expect(robotsPolicy({ status: 'found', text: star })(url)).toBe(false);
    expect(robotsPolicy({ status: 'found', text: star })(new URL('https://example.in/privacy'))).toBe(true);
  });
});
