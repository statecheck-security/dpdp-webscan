import { describe, expect, it } from 'vitest';
import { isBlockedAddress, parseTarget, resolvePublic, TargetError, type Lookup } from '../src/guard.js';

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::7f00:1',
    '2001:db8::1',
    '2002:7f00:1::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['1.1.1.1', '8.8.8.8', '76.76.21.21', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4001::'])(
    'allows public %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe('parseTarget', () => {
  it('assumes https for a bare domain and drops the fragment', () => {
    expect(parseTarget(' example.in/about#x ').href).toBe('https://example.in/about');
  });

  it.each([
    ['ftp://example.in', 'SCHEME'],
    ['file:///etc/passwd', 'SCHEME'],
    ['javascript:alert(1)', 'SCHEME'],
    ['data:text/html,hi', 'SCHEME'],
    ['https://user:pass@example.in', 'CREDENTIALS'],
    ['https://example.in:22', 'PORT'],
    ['https://example.in:8443', 'PORT'],
    ['http://127.0.0.1', 'IP_LITERAL'],
    ['http://2130706433', 'IP_LITERAL'], // decimal 127.0.0.1
    ['http://0x7f000001', 'IP_LITERAL'], // hex
    ['http://0177.0.0.1', 'IP_LITERAL'], // octal
    ['http://[::1]', 'IP_LITERAL'],
    ['http://[::ffff:127.0.0.1]', 'IP_LITERAL'],
    ['http://localhost', 'HOSTNAME'],
    ['http://intranet', 'HOSTNAME'],
    ['http://printer.local', 'HOSTNAME'],
    ['http://db.internal', 'HOSTNAME'],
    ['http://x.home.arpa', 'HOSTNAME'],
    ['not a url at all', 'INVALID_URL'],
  ])('refuses %s (%s)', (input, code) => {
    expect(() => parseTarget(input)).toThrowError(expect.objectContaining({ code }));
  });

  it('accepts explicit default ports, which URL drops', () => {
    expect(parseTarget('https://example.in:443').href).toBe('https://example.in/');
  });
});

describe('resolvePublic', () => {
  const fake =
    (...addresses: string[]): Lookup =>
    async () =>
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

  it('returns public addresses', async () => {
    await expect(resolvePublic('example.in', fake('93.184.215.14'))).resolves.toEqual(['93.184.215.14']);
  });

  it('refuses a name that resolves to a private address', async () => {
    await expect(resolvePublic('evil.example.in', fake('10.0.0.5'))).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
  });

  it('refuses when any record is private (mixed public and private)', async () => {
    await expect(resolvePublic('mixed.example.in', fake('93.184.215.14', '169.254.169.254'))).rejects.toBeInstanceOf(
      TargetError,
    );
  });

  it('refuses when DNS fails or returns nothing', async () => {
    const failing: Lookup = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(resolvePublic('nx.example.in', failing)).rejects.toMatchObject({ code: 'DNS' });
    await expect(resolvePublic('empty.example.in', fake())).rejects.toMatchObject({ code: 'DNS' });
  });
});
