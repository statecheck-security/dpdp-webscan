// The egress proxy's dialling and timeouts (WS-11a). Every dial is replaced:
// "public" addresses map to local servers on 127.0.0.1, to a refused
// connection, or to a socket that never connects. Nothing leaves the machine.
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { connect, createServer, Socket } from 'node:net';
import type { AddressInfo, Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { dialFirst, startEgressProxy } from '../src/egress.js';
import type { BlockedRequest, Dial, EgressProxy } from '../src/egress.js';
import type { Lookup } from '../src/guard.js';
import { silentLog } from '../src/log.js';

const FIRST = '93.184.215.14';
const SECOND = '93.184.215.15';
const HOST = 'site.fixture.in';

type Behaviour = 'refuse' | 'hang' | number;

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function lookupOf(...addresses: string[]): Lookup {
  return () => Promise.resolve(addresses.map((address) => ({ address, family: 4 })));
}

/** A dial that maps each address to a behaviour, recording every attempt. */
function dialOf(map: Record<string, Behaviour>, attempts: string[] = []): Dial {
  return (address, port) => {
    attempts.push(`${address}:${port}`);
    const behaviour = map[address] ?? 'refuse';
    if (typeof behaviour === 'number') return connect({ host: '127.0.0.1', port: behaviour });
    const socket = new Socket();
    cleanups.push(() => void socket.destroy());
    if (behaviour === 'refuse') process.nextTick(() => socket.destroy(new Error('refused')));
    return socket;
  };
}

async function listen(server: Server | HttpServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        if ('closeAllConnections' in server) server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return (server.address() as AddressInfo).port;
}

/** A TCP server that echoes what it gets: stands in for a TLS upstream. */
async function echoServer(): Promise<number> {
  const sockets = new Set<Socket>();
  const server = createServer((s) => {
    sockets.add(s);
    s.pipe(s);
  });
  cleanups.push(() => sockets.forEach((s) => s.destroy()));
  return listen(server);
}

async function proxyWith(
  dial: Dial,
  lookup: Lookup,
  limits: Parameters<typeof startEgressProxy>[0]['limits'] = {},
): Promise<{ proxy: EgressProxy; port: number; blocked: BlockedRequest[] }> {
  const blocked: BlockedRequest[] = [];
  const proxy = await startEgressProxy({ log: silentLog, dial, lookup, blocked, limits });
  cleanups.push(() => proxy.close());
  return { proxy, port: Number(new URL(proxy.server).port), blocked };
}

/** Open a CONNECT tunnel; resolves with the status line and the socket, left open. */
function tunnel(port: number, host = HOST): Promise<{ status: string; socket: Socket }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    cleanups.push(() => void socket.destroy());
    socket.once('error', reject);
    socket.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
    socket.once('data', (chunk) => resolve({ status: chunk.toString('latin1').split('\r\n')[0] ?? '', socket }));
  });
}

/** A plain-http request through the proxy. */
function get(port: number, url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: url, headers: { host: new URL(url).host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('dialFirst', () => {
  it('returns the first address that connects', async () => {
    const port = await echoServer();
    const attempts: string[] = [];
    const socket = await dialFirst([FIRST, SECOND], 443, dialOf({ [FIRST]: 'refuse', [SECOND]: port }, attempts), 500);
    expect(socket).toBeDefined();
    socket?.destroy();
    expect(attempts).toEqual([`${FIRST}:443`, `${SECOND}:443`]);
  });

  it('moves on from an address that never connects', async () => {
    const port = await echoServer();
    const started = Date.now();
    const socket = await dialFirst([FIRST, SECOND], 443, dialOf({ [FIRST]: 'hang', [SECOND]: port }), 200);
    expect(socket).toBeDefined();
    socket?.destroy();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('gives up when no address connects', async () => {
    const socket = await dialFirst([FIRST, SECOND], 443, dialOf({ [FIRST]: 'refuse', [SECOND]: 'hang' }), 100);
    expect(socket).toBeUndefined();
  });
});

describe('egress proxy tunnels', () => {
  it('tunnels to the second address when the first refuses', async () => {
    const echo = await echoServer();
    const attempts: string[] = [];
    const { port } = await proxyWith(dialOf({ [FIRST]: 'refuse', [SECOND]: echo }, attempts), lookupOf(FIRST, SECOND));
    const { status, socket } = await tunnel(port);
    expect(status).toBe('HTTP/1.1 200 Connection Established');
    const echoed = new Promise<string>((resolve) => socket.once('data', (c) => resolve(c.toString())));
    socket.write('ping');
    expect(await echoed).toBe('ping');
    expect(attempts).toEqual([`${FIRST}:443`, `${SECOND}:443`]);
  });

  it('answers 502 when no address connects', async () => {
    const { port } = await proxyWith(dialOf({ [FIRST]: 'refuse', [SECOND]: 'hang' }), lookupOf(FIRST, SECOND), {
      dialTimeoutMs: 100,
    });
    expect((await tunnel(port)).status).toBe('HTTP/1.1 502 Bad Gateway');
  });

  it('refuses a host with a private address without dialling anything', async () => {
    const attempts: string[] = [];
    const { port, blocked } = await proxyWith(dialOf({}, attempts), lookupOf(FIRST, '10.0.0.5'));
    expect((await tunnel(port)).status).toBe('HTTP/1.1 403 Forbidden');
    expect(attempts).toEqual([]);
    expect(blocked).toEqual([{ host: HOST, reason: 'ssrf' }]);
  });

  it('closes a tunnel that stays idle', async () => {
    const echo = await echoServer();
    const { port } = await proxyWith(dialOf({ [FIRST]: echo }), lookupOf(FIRST), { tunnelIdleMs: 200 });
    const { status, socket } = await tunnel(port);
    expect(status).toBe('HTTP/1.1 200 Connection Established');
    const started = Date.now();
    await new Promise((resolve) => socket.once('close', resolve));
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('refuses tunnels beyond the cap, and not as an SSRF block', async () => {
    const echo = await echoServer();
    const { port, blocked } = await proxyWith(dialOf({ [FIRST]: echo }), lookupOf(FIRST), { maxTunnels: 1 });
    const first = await tunnel(port);
    expect(first.status).toBe('HTTP/1.1 200 Connection Established');
    expect((await tunnel(port)).status).toBe('HTTP/1.1 503 Service Unavailable');
    expect(blocked).toEqual([]);
    // Closing the first frees its slot.
    first.socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await tunnel(port)).status).toBe('HTTP/1.1 200 Connection Established');
  });
});

describe('egress proxy plain http', () => {
  it('fetches through the second address when the first refuses', async () => {
    const server = createHttpServer((_req, res) => res.end('hello'));
    const web = await listen(server);
    const { port } = await proxyWith(dialOf({ [FIRST]: 'refuse', [SECOND]: web }), lookupOf(FIRST, SECOND));
    expect(await get(port, `http://${HOST}/`)).toEqual({ status: 200, body: 'hello' });
  });

  it('answers 502 when no address connects', async () => {
    const { port } = await proxyWith(dialOf({ [FIRST]: 'refuse' }), lookupOf(FIRST));
    expect((await get(port, `http://${HOST}/`)).status).toBe(502);
  });

  it('gives up on an upstream that never answers', async () => {
    const server = createHttpServer(() => undefined);
    const web = await listen(server);
    const { port } = await proxyWith(dialOf({ [FIRST]: web }), lookupOf(FIRST), { upstreamIdleMs: 200 });
    const started = Date.now();
    expect((await get(port, `http://${HOST}/`)).status).toBe(504);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
