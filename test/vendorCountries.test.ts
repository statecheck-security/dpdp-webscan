// WS-11f: every vendor on the tracker list has a sourced country or a written reason, never a guess.
import { describe, expect, it } from 'vitest';
import { categorise, TRACKERS } from '../src/data/trackers.js';
import { VENDOR_COUNTRIES } from '../src/data/vendorCountries.js';

const vendors = [...new Set(TRACKERS.map((t) => t.vendor))];

describe('VENDOR_COUNTRIES', () => {
  it.each(vendors)('has an entry for %s', (vendor) => {
    expect(VENDOR_COUNTRIES[vendor]).toBeDefined();
  });

  it('has no entry for a vendor the tracker list does not use', () => {
    expect(Object.keys(VENDOR_COUNTRIES).filter((v) => !vendors.includes(v))).toEqual([]);
  });

  it.each(Object.entries(VENDOR_COUNTRIES))('%s: a country with its source, or a reason', (_vendor, entry) => {
    expect(entry.company.length).toBeGreaterThan(0);
    if (entry.country !== undefined) {
      expect(entry.country).toMatch(/^[A-Z]{2}$/);
      expect(entry.source).toMatch(/^https:\/\//);
      expect(entry.reason).toBeUndefined();
    } else {
      expect(entry.reason?.length ?? 0).toBeGreaterThan(0);
      expect(entry.source).toBeUndefined();
    }
  });
});

describe('categorise with countries', () => {
  it.each([
    ['www.google-analytics.com', 'US'],
    ['checkout.razorpay.com', 'IN'],
    ['plausible.io', 'EE'],
    ['cdn.privacy-mgmt.com', 'US'],
  ])('%s → %s', (host, country) => {
    expect(categorise(host)?.country).toBe(country);
  });

  it('leaves the country out when it is not known', () => {
    expect(categorise('js.stripe.com')).not.toHaveProperty('country');
    expect(categorise('static.hotjar.com')).not.toHaveProperty('country');
  });
});
