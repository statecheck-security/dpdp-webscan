// W12–W16 and their matchers (WS-5a), from hand-built contexts: text is matched, never stored.
import { describe, expect, it } from 'vitest';
import type { CheckContext } from '../../src/checks/context.js';
import { grievancePeriods, periodDays, searchedPages, sentences } from '../../src/checks/published.js';
import type { PublishedPage } from '../../src/checks/published.js';
import { detectW12 } from '../../src/checks/w12.js';
import { detectW13 } from '../../src/checks/w13.js';
import { detectW14 } from '../../src/checks/w14.js';
import { detectW15 } from '../../src/checks/w15.js';
import { detectW16 } from '../../src/checks/w16.js';
import type { PageReason } from '../../src/types.js';
import { context, PAGE } from './context.js';

interface Spec {
  path?: string;
  reason?: PageReason;
  text: string;
  hasMailto?: boolean;
}

/** A context whose loaded pages carry the given text. */
function withPages(specs: Spec[]): CheckContext {
  const pages = specs.map((s, i) => ({
    url: `${PAGE}${s.path ?? (i === 0 ? '' : `p${i}`)}`,
    reason: s.reason ?? (i === 0 ? 'requested' : 'privacy'),
    status: 'loaded' as const,
    httpStatus: 200,
  }));
  const texts = new Map(
    pages.map((p, i) => [
      p.url,
      { text: specs[i]?.text ?? '', langs: ['en'], hasMailto: specs[i]?.hasMailto ?? false },
    ]),
  );
  return context({ pages, texts });
}

const page = (text: string, reason: PageReason = 'privacy'): PublishedPage => ({
  url: `${PAGE}privacy`,
  reason,
  text: { text, langs: [], hasMailto: false },
});

describe('searchedPages and sentences', () => {
  it('searches loaded pages we read text from, in scan order', () => {
    const ctx = withPages([{ text: 'home' }, { text: 'privacy' }]);
    ctx.pages.push({ url: `${PAGE}contact`, reason: 'contact', status: 'timeout' });
    ctx.pages.push({ url: `${PAGE}terms`, reason: 'terms', status: 'loaded', httpStatus: 200 });
    expect(searchedPages(ctx).map((p) => p.url)).toEqual([PAGE, `${PAGE}p1`]);
  });

  it('splits at line breaks and sentence ends', () => {
    expect(sentences('Heading\nOne. Two? Three!  Four\tCell')).toEqual([
      'Heading',
      'One.',
      'Two?',
      'Three!',
      'Four',
      'Cell',
    ]);
  });
});

describe('absence checks', () => {
  it.each([
    ['W12', detectW12],
    ['W13', detectW13],
    ['W14', detectW14],
    ['W15', detectW15],
    ['W16', detectW16],
  ])('%s says nothing when no page text was read', (_id, detect) => {
    expect(detect(context({ texts: new Map() }))).toBeUndefined();
  });

  it('all five fire on pages that publish none of the items, listing the pages searched', () => {
    const ctx = withPages([
      { text: 'Fresh bread.\nPrivacy Policy Contact Terms' },
      { text: 'We collect your address.' },
    ]);
    for (const detect of [detectW12, detectW13, detectW14, detectW15, detectW16]) {
      expect(detect(ctx)?.evidence).toEqual({ pagesSearched: [PAGE, `${PAGE}p1`] });
    }
  });
});

describe('detectW12', () => {
  it.each([
    'Contact our Grievance Officer, Ms Example.',
    'Our Data Protection Officer can help.',
    'Write to privacy@example.in.',
    'If you have questions about this privacy policy, write to us.',
    'Questions about your personal data? Call us.',
  ])('finds a privacy contact in "%s"', (text) => {
    expect(detectW12(withPages([{ text: 'Home' }, { text }]))).toBeUndefined();
  });

  it('counts a mailto link on a privacy or contact page, not on the home page', () => {
    expect(
      detectW12(withPages([{ text: 'Home' }, { text: 'Email us', reason: 'contact', hasMailto: true }])),
    ).toBeUndefined();
    expect(detectW12(withPages([{ text: 'Home', hasMailto: true }]))?.id).toBe('W12');
  });

  it('is not fooled by footer links', () => {
    expect(detectW12(withPages([{ text: 'Privacy Policy | Contact us | Terms' }]))?.id).toBe('W12');
  });
});

describe('detectW13', () => {
  it.each([
    'You can request access to your personal data.',
    'To exercise your rights, use our form.',
    'You may nominate another person.',
    'You have the right to erasure.',
    'You can update your personal information from your account.',
  ])('finds the means in "%s"', (text) => {
    expect(detectW13(withPages([{ text }]))).toBeUndefined();
  });

  it('does not count withdrawing consent', () => {
    expect(detectW13(withPages([{ text: 'Email us to withdraw your consent.' }]))?.id).toBe('W13');
  });
});

describe('detectW15 and detectW16', () => {
  it('W15 finds the Board', () => {
    expect(detectW15(withPages([{ text: 'You may complain to the Data Protection Board of India.' }]))).toBeUndefined();
  });

  it.each([
    'To withdraw your consent, email privacy@example.in.',
    'You can withdraw consent at any time using the cookie settings link.',
    'Consent can be withdrawn from your account dashboard.',
  ])('W16 finds how to withdraw in "%s"', (text) => {
    expect(detectW16(withPages([{ text }]))).toBeUndefined();
  });

  it('W16 reads a rights table row as one unit, but not the next row', () => {
    const row = 'Right to Withdraw Consent\tWithdraw consent at any time.\tOne-click unsubscribe in every email.';
    expect(detectW16(withPages([{ text: row }]))).toBeUndefined();
    const split = 'Right to Withdraw Consent\tWithdraw consent at any time.\nRight to Erasure\tEmail us.';
    expect(detectW16(withPages([{ text: split }]))?.id).toBe('W16');
  });

  it('W16 needs the how in the same sentence', () => {
    expect(detectW16(withPages([{ text: 'You may withdraw your consent.\nEmail us any time.' }]))?.id).toBe('W16');
  });
});

describe('W14 periods', () => {
  it.each([
    ['30', undefined, 'days', 30],
    ['thirty', undefined, 'days', 30],
    ['Thirty', 'working ', 'days', 42],
    ['15', 'business ', 'days', 21],
    ['one', undefined, 'month', 30],
    ['two', undefined, 'weeks', 14],
    ['one hundred and twenty', undefined, 'days', 120],
    ['umpteen', undefined, 'days', undefined],
  ])('%s %s%s → %s days', (amount, qualifier, unit, days) => {
    expect(periodDays(amount, qualifier, unit)).toBe(days);
  });

  it('reads periods tied to grievances, including "thirty (30) days"', () => {
    const found = grievancePeriods(page('We will resolve your complaint within thirty (30) days of receiving it.'));
    expect(found.map((p) => p.days)).toEqual([30]);
  });

  it('ties a period to the previous sentence, or to a grievance page', () => {
    expect(grievancePeriods(page('Send us your grievance. We reply within 15 days.')).map((p) => p.days)).toEqual([15]);
    expect(grievancePeriods(page('We reply within 10 days.', 'grievance')).map((p) => p.days)).toEqual([10]);
  });

  it('ignores periods that are not about grievances', () => {
    expect(grievancePeriods(page('Refunds are processed within 7 days.'))).toEqual([]);
  });

  it('masks emails and phone numbers in the quote', () => {
    const [found] = grievancePeriods(
      page('Email grievance@example.in or call +91 80 0000 0000 and we resolve complaints within 120 days.'),
    );
    expect(found?.quote).toBe('Email [email] or call [number] and we resolve complaints within 120 days.');
  });

  it('W14 is quiet with a period of 90 days or less, and the longest decides', () => {
    const ok = withPages([{ text: 'We resolve grievances within 90 days.' }]);
    expect(detectW14(ok)).toBeUndefined();
    const long = withPages([
      { text: 'We acknowledge complaints within 2 days.' },
      { text: 'Grievances are resolved within 4 months.' },
    ]);
    expect(detectW14(long)?.evidence).toEqual({
      pagesSearched: [PAGE, `${PAGE}p1`],
      quote: 'Grievances are resolved within 4 months.',
      foundOn: `${PAGE}p1`,
    });
  });

  it('marks a period as a response period only when response wording sits just before it', () => {
    const found = grievancePeriods(page('We acknowledge every grievance within 2 days and resolve it within 30 days.'));
    expect(found.map((p) => [p.days, p.response])).toEqual([
      [2, false],
      [30, true],
    ]);
  });

  it('W14 lets a response period decide over a longer period that is not one', () => {
    const ctx = withPages([
      {
        text: 'We resolve complaints within 30 days.\nWe keep complaint records for up to 6 months.',
        reason: 'grievance',
      },
    ]);
    expect(detectW14(ctx)).toBeUndefined();
  });

  it('W14 falls back to the longest period when none reads as a response period', () => {
    const ctx = withPages([{ text: 'Grievances: within 30 days. Complaint records: up to 6 months.' }]);
    expect(detectW14(ctx)?.evidence.quote).toBe('Complaint records: up to 6 months.');
  });

  it('W14 quotes at most 25 words', () => {
    const filler = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const [found] = grievancePeriods(page(`${filler} grievances are resolved within 200 days ${filler}.`));
    expect(found?.quote.split(' ').length).toBeLessThanOrEqual(26);
    expect(found?.quote).toContain('within 200 days');
  });
});
