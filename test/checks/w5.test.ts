// W5: consent inferred from browsing, from hand-built contexts.
import { describe, expect, it } from 'vitest';
import type { BannerButton } from '../../src/banner.js';
import { quoteOf } from '../../src/checks/evidence.js';
import { detectW5 } from '../../src/checks/w5.js';
import { banner, button, context } from './context.js';

const withText = (text: string, buttons: BannerButton[] = [button('accept', 'OK')]) =>
  context({ banner: banner(buttons, text) });

describe('detectW5', () => {
  it.each([
    'By continuing to browse this site, you agree to our use of cookies.',
    'By using this website you consent to cookies.',
    'Your continued use of the site means you accept cookies.',
    'If you continue, we will assume you are happy with it.',
  ])('quotes "%s"', (sentence) => {
    expect(detectW5(withText(`We use cookies. ${sentence} Learn more.`))).toEqual({
      id: 'W5',
      evidence: { quote: sentence },
    });
  });

  it.each([
    'By clicking Accept, you agree to our use of cookies.',
    'We use cookies only if you agree.',
    'Choose which cookies we may use.',
  ])('is quiet on "%s"', (text) => {
    expect(detectW5(withText(text))).toBeUndefined();
  });

  it('is quiet when the first layer has a reject control', () => {
    const text = 'By continuing to browse, you agree to our use of cookies.';
    expect(detectW5(withText(text, [button('reject'), button('accept')]))).toBeUndefined();
  });

  it('is quiet without a banner', () => {
    expect(detectW5(context())).toBeUndefined();
  });

  it('masks an email or phone number in the quoted sentence, so the result stays redacted', () => {
    const text = 'By continuing to browse you agree; write to privacy@example.in or call +91 80 0000 0000.';
    expect(detectW5(withText(text))?.evidence.quote).toBe(
      'By continuing to browse you agree; write to [email] or call [number].',
    );
  });

  it('cuts a quote to 25 words', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    expect(quoteOf(long).split(' ')).toHaveLength(26);
    expect(quoteOf(long).endsWith('w24 …')).toBe(true);
  });
});
