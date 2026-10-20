// Fixture harness (WS-8a). Nothing a test does may reach the network:
//  - every fixture host resolves (fakeLookup) to a public address, so src/guard.ts accepts it unchanged;
//  - `routeFixtures` fulfils first-hop requests straight from fixtures/<name>/ (never falls through);
//  - redirect hops bypass routes and go through the egress proxy, whose dial is replaced here: `noNetworkDial`
//    refuses everything, `fixtureDial` connects to a local http server serving the same fixture.
//
// Decision 2026-10-20: first hops are fulfilled from disk rather than via node:http servers on ephemeral
// ports (plan WS-8a): same isolation, https URLs work without certificates. The local server is only for
// plain-http redirect chains, which have to pass through the proxy.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect, Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import type { BrowserContext } from 'playwright';
import type { HardenedContextOptions } from '../src/browser.js';
import type { Dial } from '../src/egress.js';
import type { Lookup } from '../src/guard.js';
import { silentLog } from '../src/log.js';

export const SITE = 'https://site.fixture.in/';
const FIXTURES_DIR = resolve('fixtures');
const PUBLIC_ADDRESS = '93.184.215.14';

/** Fixture hosts that resolve to a private address, to exercise the SSRF guard. */
const PRIVATE_HOSTS: Record<string, string> = {
  'private.fixture.in': '10.0.0.5',
  'metadata.fixture.in': '169.254.169.254',
};

export const fakeLookup: Lookup = async (hostname) => {
  const host = hostname.toLowerCase();
  const priv = PRIVATE_HOSTS[host];
  if (priv) return [{ address: priv, family: 4 }];
  if (host.endsWith('.fixture.in')) return [{ address: PUBLIC_ADDRESS, family: 4 }];
  throw Object.assign(new Error(`fakeLookup: ${host} is not a fixture host`), { code: 'ENOTFOUND' });
};

interface FixtureResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function hostDir(fixture: string, host: string): string | undefined {
  if (host === 'site.fixture.in') return join(FIXTURES_DIR, fixture);
  for (const dir of [join(FIXTURES_DIR, fixture, '_hosts', host), join(FIXTURES_DIR, '_shared', host)]) {
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

function fileFor(dir: string, pathname: string): string | undefined {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = resolve(dir, candidate);
    if (!file.startsWith(dir + sep)) return undefined;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return undefined;
}

/** The response for a fixture URL: a canned one from `_routes.json` (keyed `host/path`), a file, or 404. */
function respond(fixture: string, url: URL): FixtureResponse {
  const routesFile = join(FIXTURES_DIR, fixture, '_routes.json');
  if (existsSync(routesFile)) {
    const canned = JSON.parse(readFileSync(routesFile, 'utf8')) as Record<string, Partial<FixtureResponse>>;
    const preset = canned[`${url.hostname}${url.pathname}`];
    if (preset) return { status: preset.status ?? 200, headers: preset.headers ?? {}, body: preset.body ?? '' };
  }
  const dir = hostDir(fixture, url.hostname);
  const file = dir ? fileFor(dir, url.pathname) : undefined;
  if (!file) return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'not found' };
  return {
    status: 200,
    headers: { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' },
    body: readFileSync(file),
  };
}

export interface FixtureRouting {
  /** Hosts the router refused because they are not fixture hosts. Should stay empty. */
  unrouted: string[];
  install: (context: BrowserContext) => Promise<void>;
}

/** Fulfil every first-hop request of a context from fixtures/<name>/ (and fixtures/_shared/ for third parties). */
export function routeFixtures(fixture: string): FixtureRouting {
  const unrouted: string[] = [];
  return {
    unrouted,
    install: async (context) => {
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (!url.hostname.endsWith('.fixture.in')) {
          unrouted.push(url.hostname);
          return route.abort('internetdisconnected');
        }
        const { status, headers, body } = respond(fixture, url);
        return route.fulfill({ status, headers, body });
      });
    },
  };
}

/** Proxy dial for tests that expect no connection to get through. Records what was attempted. */
export function noNetworkDial(attempts: string[] = []): Dial {
  return (address, port) => {
    attempts.push(`${address}:${port}`);
    const socket = new Socket();
    process.nextTick(() => socket.destroy(new Error('no network in tests')));
    return socket;
  };
}

/** A local http server for one fixture, and a proxy dial that sends every connection to it. */
export async function serveFixtureHttp(fixture: string): Promise<{ dial: Dial; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'site.fixture.in'}`);
    const { status, headers, body } = respond(fixture, url);
    res.writeHead(status, headers).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    dial: () => connect({ host: '127.0.0.1', port }),
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

/** Options for newHardenedContext that keep a test off the network. */
export function fixtureContextOptions(
  fixture: string,
  extra: Partial<HardenedContextOptions> = {},
): { options: HardenedContextOptions; routing: FixtureRouting } {
  const routing = routeFixtures(fixture);
  return {
    routing,
    options: { lookup: fakeLookup, log: silentLog, install: routing.install, dial: noNetworkDial(), ...extra },
  };
}
