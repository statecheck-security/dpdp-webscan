// docker/egress.sh must reject every range src/guard.ts blocks, and the Docker
// base image must match the Playwright version (WS-3f). Reads files only: no
// network, no Docker.
import { readFileSync } from 'node:fs';
import { BlockList } from 'node:net';
import { describe, expect, it } from 'vitest';
import { BLOCKED_IPV4, BLOCKED_IPV6, isBlockedAddress } from '../src/guard.js';

const script = readFileSync('docker/egress.sh', 'utf8');

function shellList(name: string): string[] {
  const match = new RegExp(`^${name}="\\n([^"]*)"$`, 'm').exec(script);
  if (!match?.[1]) throw new Error(`${name} not found in docker/egress.sh`);
  return match[1].split('\n').filter((line) => line.trim() !== '');
}

function cidr(range: string): [string, number] {
  const [net, prefix] = range.split('/');
  if (!net || prefix === undefined) throw new Error(`bad range ${range}`);
  return [net, Number(prefix)];
}

function covers(ranges: string[], family: 'ipv4' | 'ipv6', net: string, prefix: number): boolean {
  // A guard range is covered when some script range contains its network
  // address with a prefix no longer than the guard's.
  return ranges.some((r) => {
    const [rNet, rPrefix] = cidr(r);
    if (rPrefix > prefix) return false;
    const list = new BlockList();
    list.addSubnet(rNet, rPrefix, family);
    return list.check(net, family);
  });
}

describe('docker/egress.sh ranges', () => {
  const v4 = shellList('BLOCKED_IPV4');
  const v6 = shellList('BLOCKED_IPV6');

  it.each(BLOCKED_IPV4.map(([net, prefix]) => [`${net}/${prefix}`, net, prefix] as const))(
    'rejects guard range %s',
    (_label, net, prefix) => {
      expect(covers(v4, 'ipv4', net, prefix)).toBe(true);
    },
  );

  it.each(BLOCKED_IPV6.map(([net, prefix]) => [`${net}/${prefix}`, net, prefix] as const))(
    'rejects guard range %s',
    (_label, net, prefix) => {
      expect(covers(v6, 'ipv6', net, prefix)).toBe(true);
    },
  );

  it('rejects nothing the guard would allow', () => {
    for (const range of [...v4, ...v6]) {
      expect(isBlockedAddress(cidr(range)[0]), range).toBe(true);
    }
  });

  it('allows loopback before any reject rule', () => {
    const lo = script.indexOf('-A OUTPUT -o lo -j ACCEPT');
    const reject = script.indexOf('reject "$tool" -d');
    expect(lo).toBeGreaterThan(-1);
    expect(lo).toBeLessThan(reject);
  });
});

describe('docker/Dockerfile', () => {
  it('uses the Playwright image for the locked Playwright version', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
      packages: Record<string, { version?: string }>;
    };
    const version = lock.packages['node_modules/playwright']?.version;
    expect(version).toBeDefined();
    const dockerfile = readFileSync('docker/Dockerfile', 'utf8');
    expect(dockerfile).toMatch(new RegExp(`^FROM mcr\\.microsoft\\.com/playwright:v${version}-noble$`, 'm'));
  });
});
