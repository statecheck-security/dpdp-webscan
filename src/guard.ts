/**
 * SSRF pre-checks for scan targets (plan section 4, WS-3).
 *
 * This is the application layer only. It runs before a scan and, later, on
 * every navigation, redirect and subrequest via Playwright request
 * interception. DNS rebinding can still beat an app-level check, so scans must
 * also run behind network-level egress rules that drop the same ranges
 * (Docker network locally, nftables on a hosted worker). Never run the browser
 * without them.
 */

import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

export class TargetError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_URL'
      | 'SCHEME'
      | 'CREDENTIALS'
      | 'PORT'
      | 'IP_LITERAL'
      | 'HOSTNAME'
      | 'BLOCKED_ADDRESS'
      | 'DNS',
    message: string,
  ) {
    super(message);
    this.name = 'TargetError';
  }
}

// Separate lists: a single BlockList matches IPv4 addresses against IPv6 rules
// such as ::ffff:0:0/96 (IPv4-mapped), which would block every IPv4 address.
const blocked4 = new BlockList();
const blocked6 = new BlockList();

// IPv4: this-network, private, CGNAT, loopback, link-local (incl. cloud metadata
// 169.254.169.254), IETF protocol assignments, documentation, 6to4 relay,
// benchmarking, multicast, reserved, broadcast.
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked4.addSubnet(net, prefix, 'ipv4');
}

// IPv6: unspecified, loopback, IPv4-mapped, NAT64 and 6to4 and Teredo (all embed
// IPv4 we'd otherwise have to unpack), discard, documentation, ULA, link-local,
// multicast. Public sites don't publish these in AAAA records.
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked6.addSubnet(net, prefix, 'ipv6');
}

/** True if the address is not a public unicast address we may connect to. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked4.check(address, 'ipv4');
  if (family === 6) {
    // Only global unicast (2000::/3) is ever allowed.
    const first = parseInt(address.split(':')[0] || '0', 16);
    if ((first & 0xe000) !== 0x2000) return true;
    return blocked6.check(address, 'ipv6');
  }
  return true;
}

const BLOCKED_SUFFIXES = [
  'localhost',
  'local',
  'internal',
  'intranet',
  'lan',
  'home',
  'home.arpa',
  'corp',
  'test',
  'invalid',
  'example',
  'onion',
  'arpa',
];

/**
 * Parse and validate a user-supplied target. Throws TargetError.
 * Accepts a bare domain ("example.in") by assuming https.
 */
export function parseTarget(input: string): URL {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new TargetError('INVALID_URL', 'Not a valid URL.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TargetError('SCHEME', 'Only http and https addresses can be scanned.');
  }
  if (url.username || url.password) {
    throw new TargetError('CREDENTIALS', 'Addresses with a username or password are not accepted.');
  }
  if (url.port !== '') {
    throw new TargetError('PORT', 'Only the standard web ports (80 and 443) can be scanned.');
  }

  // WHATWG URL parsing normalises decimal, octal and hex IPv4 forms to dotted
  // quads, and IPv6 literals keep their brackets, so this catches all of them.
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host) !== 0) {
    throw new TargetError('IP_LITERAL', 'Enter a domain name, not an IP address.');
  }
  if (!host.includes('.') || host.endsWith('.')) {
    throw new TargetError('HOSTNAME', 'Enter a full public domain name.');
  }
  if (BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    throw new TargetError('HOSTNAME', 'That domain is not on the public internet.');
  }

  url.hash = '';
  return url;
}

export type Lookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

const defaultLookup: Lookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/**
 * Resolve a hostname and require every address to be public. Rejecting when
 * any address is private stops split-horizon tricks that mix public and
 * private records.
 */
export async function resolvePublic(hostname: string, lookup: Lookup = defaultLookup): Promise<string[]> {
  let records: { address: string; family: number }[];
  try {
    records = await lookup(hostname);
  } catch {
    throw new TargetError('DNS', `Could not resolve ${hostname}.`);
  }
  if (records.length === 0) {
    throw new TargetError('DNS', `Could not resolve ${hostname}.`);
  }
  const bad = records.find((r) => isBlockedAddress(r.address));
  if (bad) {
    throw new TargetError('BLOCKED_ADDRESS', `${hostname} resolves to a non-public address.`);
  }
  return records.map((r) => r.address);
}
