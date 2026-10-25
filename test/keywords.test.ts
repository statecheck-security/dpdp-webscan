// WS-4b: banner control roles by label (order matters: reject, then settings, then accept),
// and the persistent-control labels W7 looks for.
import { describe, expect, it } from 'vitest';
import { BUTTON_ROLES, FORM_PAGE_LINKS, PERSISTENT_CONTROL } from '../src/data/keywords.js';

const roleOf = (label: string) => BUTTON_ROLES.find((r) => r.label.test(label))?.role ?? 'other';

describe('BUTTON_ROLES', () => {
  it.each([
    ['Accept all', 'accept'],
    ['Allow all cookies', 'accept'],
    ['Got it!', 'accept'],
    ['OK', 'accept'],
    ['I agree', 'accept'],
    ['Reject all', 'reject'],
    ['Decline', 'reject'],
    ['No, thanks', 'reject'],
    ['Accept only necessary', 'reject'],
    ['Only essential cookies', 'reject'],
    ['Necessary cookies only', 'reject'],
    ['Continue without accepting', 'reject'],
    ['Cookie settings', 'settings'],
    ['Manage preferences', 'settings'],
    ['Customise', 'settings'],
    ['Privacy policy', 'other'],
    ['Close', 'other'],
  ])('%s → %s', (label, role) => {
    expect(roleOf(label)).toBe(role);
  });
});

describe('PERSISTENT_CONTROL', () => {
  it.each(['Cookie settings', 'Manage cookies', 'Your privacy choices', 'Do Not Sell My Info', 'Withdraw consent'])(
    'matches %s',
    (label) => {
      expect(PERSISTENT_CONTROL.test(label)).toBe(true);
    },
  );

  it.each(['Cookie Policy', 'Privacy Policy', 'Contact us'])('does not match %s', (label) => {
    expect(PERSISTENT_CONTROL.test(label)).toBe(false);
  });
});

describe('FORM_PAGE_LINKS', () => {
  it.each([
    'Free Gap Check',
    'Get a free website audit',
    'Book a consultation',
    'Take the free assessment',
    'Request a callback',
    'Sign up',
    'Get started',
  ])('treats "%s" as a likely form page', (label) => {
    expect(FORM_PAGE_LINKS.text.test(label)).toBe(true);
  });

  it.each(['About us', 'Blog', 'Services', 'Check out our blog', 'Careers'])('does not treat "%s" as one', (label) => {
    expect(FORM_PAGE_LINKS.text.test(label)).toBe(false);
  });
});
