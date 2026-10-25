// Review fixes (2026-10-25): how every page URL is recorded.
import { describe, expect, it } from 'vitest';
import { pageUrlOf, pageUrlOfString, VALUE_TOKEN } from '../src/urls.js';

describe('pageUrlOf', () => {
  it.each([
    // The query names the page on a front controller: kept.
    ['https://shop.in/?page_id=3', 'https://shop.in/?page_id=3'],
    ['https://shop.in/index.php?page=privacy', 'https://shop.in/index.php?page=privacy'],
    ['https://shop.in/page.aspx?id=12&lang=en', 'https://shop.in/page.aspx?id=12&lang=en'],
    // Campaign and click ids are never part of the page.
    ['https://shop.in/?page_id=3&utm_source=footer', 'https://shop.in/?page_id=3'],
    ['https://shop.in/?gclid=Cj0KCQjwAAAAAAAAAAAAAAAA', 'https://shop.in/'],
    // Anything that could be an identifier: dropped.
    ['https://shop.in/?sid=a1b2c3d4e5f6a7b8c9d0', 'https://shop.in/'],
    ['https://shop.in/?a=1&b=2&c=3', 'https://shop.in/'],
    ['https://shop.in/?id=12345678901&lang=en-GB', 'https://shop.in/'],
    ['https://shop.in/?email=a%40example.in', 'https://shop.in/'],
    // Not a front controller: the path names the page, the query is dropped.
    ['https://shop.in/privacy?lang=en', 'https://shop.in/privacy'],
    ['https://shop.in/privacy#cookies', 'https://shop.in/privacy'],
  ])('%s → %s', (input, recorded) => {
    expect(pageUrlOf(new URL(input))).toBe(recorded);
  });

  it('never keeps a query assertRedacted would refuse', () => {
    for (const input of ['https://shop.in/?id=123456789012&p=1234', 'https://shop.in/?a=abcdefghijkl&b=abcd']) {
      expect(VALUE_TOKEN.test(pageUrlOf(new URL(input)))).toBe(false);
    }
  });

  it('gives undefined for anything that is not http(s)', () => {
    expect(pageUrlOfString('about:blank')).toBeUndefined();
    expect(pageUrlOfString('not a url')).toBeUndefined();
    expect(pageUrlOfString('https://shop.in/a?b=c')).toBe('https://shop.in/a');
  });
});
