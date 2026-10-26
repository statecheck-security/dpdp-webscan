/**
 * Per-context egress proxy: the authoritative app-level SSRF check (WS-3b, plan section 4).
 *
 * Playwright route handlers only see the first URL of a redirect chain
 * (verified on 1.64.1, 2026-10-20), so `context.route` alone cannot re-check
 * redirect hops. Every connection Chromium makes is therefore sent through
 * this proxy on 127.0.0.1: plain-http requests and CONNECT tunnels (https,
 * wss) alike, redirect hops included. For each one it runs the guard, resolves
 * the host once, and dials the address it validated, which also stops DNS
 * rebinding between the check and the connection. docker/egress.sh (WS-3f)
 * remains the network-level backstop.
 *
 * WS-11a: every validated address is tried in turn (a site whose first DNS
 * record is dead still loads), and dials, plain-http upstreams and idle
 * tunnels all time out, so a hung server cannot hold a socket past the scan.
 */

import { createServer, request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { connect, isIP, Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { isBlockedAddress, parseTarget, resolvePublic } from './guard.js';
import type { Lookup } from './guard.js';
import type { Logger } from './log.js';

/** A request the guard refused. Host only, never the URL. */
export interface BlockedRequest {
  host: string;
  reason: 'ssrf' | 'redirects';
}

/** Opens the TCP connection for an already-validated address. Tests replace it so nothing leaves the machine. */
export type Dial = (address: string, port: number) => Socket;

const defaultDial: Dial = (address, port) => connect({ host: address, port });

/** Per address: a dial that has not connected by then is dropped and the next address tried. */
export const DIAL_TIMEOUT_MS = 3_000;
/** A plain-http upstream silent this long is closed (one page budget, PAGE_TIMEOUT_MS in browser.ts). */
export const UPSTREAM_IDLE_MS = 20_000;
/** A CONNECT tunnel with no traffic either way this long is closed. */
export const TUNNEL_IDLE_MS = 30_000;
/** Open tunnels per context; more is refused, so one page cannot exhaust the scanner's sockets. */
export const MAX_TUNNELS = 256;

export interface EgressProxyOptions {
  lookup?: Lookup;
  log: Logger;
  dial?: Dial;
  /** Shared with the route guard so one list holds every refusal of a context. */
  blocked: BlockedRequest[];
  /** Tests shorten these; production uses the constants above. */
  limits?: Partial<{ dialTimeoutMs: number; upstreamIdleMs: number; tunnelIdleMs: number; maxTunnels: number }>;
}

export interface EgressProxy {
  /** `http://127.0.0.1:<port>`, for the context's `proxy.server`. */
  server: string;
  close: () => Promise<void>;
}

const HOP_BY_HOP = ['proxy-connection', 'proxy-authorization', 'connection', 'keep-alive'];

/**
 * Check a URL against the guard and return the addresses to dial, in DNS
 * order; empty when it is refused. resolvePublic refuses a host if any of its
 * addresses is non-public, so every address returned is safe to dial. Public
 * IP literals are dialled as they are.
 */
export async function allowedAddresses(
  url: URL,
  resolved: Map<string, Promise<string[]>>,
  lookup?: Lookup,
): Promise<string[]> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];
  if (url.port !== '' || url.username || url.password) return [];
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return isBlockedAddress(host) ? [] : [host];
  try {
    parseTarget(url.href);
  } catch {
    return [];
  }
  let pending = resolved.get(host);
  if (!pending) {
    pending = resolvePublic(host, lookup);
    resolved.set(host, pending);
  }
  try {
    return await pending;
  } catch {
    return [];
  }
}

/**
 * Dial the addresses one after another until one connects. An address that
 * errors or has not connected within `timeoutMs` is dropped. Resolves
 * undefined when none connects.
 */
export async function dialFirst(
  addresses: readonly string[],
  port: number,
  dial: Dial,
  timeoutMs: number,
): Promise<Socket | undefined> {
  for (const address of addresses) {
    const socket = dial(address, port);
    const connected = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => done(false), timeoutMs);
      function done(ok: boolean): void {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        socket.off('error', onError);
        resolve(ok);
      }
      const onConnect = (): void => done(true);
      const onError = (): void => done(false);
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
    if (connected) return socket;
    // Keep a late error from an abandoned socket from becoming an unhandled 'error' event.
    socket.on('error', () => undefined);
    socket.destroy();
  }
  return undefined;
}

export async function startEgressProxy(opts: EgressProxyOptions): Promise<EgressProxy> {
  const dial = opts.dial ?? defaultDial;
  const dialTimeoutMs = opts.limits?.dialTimeoutMs ?? DIAL_TIMEOUT_MS;
  const upstreamIdleMs = opts.limits?.upstreamIdleMs ?? UPSTREAM_IDLE_MS;
  const tunnelIdleMs = opts.limits?.tunnelIdleMs ?? TUNNEL_IDLE_MS;
  const maxTunnels = opts.limits?.maxTunnels ?? MAX_TUNNELS;
  const resolved = new Map<string, Promise<string[]>>();
  const sockets = new Set<Duplex>();
  let tunnels = 0;

  const track = (socket: Duplex): void => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  };

  const refuse = (host: string): void => {
    opts.blocked.push({ host, reason: 'ssrf' });
    opts.log('request-blocked', { host, reason: 'ssrf', layer: 'proxy' });
  };

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    void (async () => {
      let url: URL;
      try {
        url = new URL(req.url ?? '');
      } catch {
        res.writeHead(400).end();
        return;
      }
      const addresses = await allowedAddresses(url, resolved, opts.lookup);
      if (addresses.length === 0) {
        refuse(url.hostname);
        req.socket.destroy();
        return;
      }
      const socket = await dialFirst(addresses, 80, dial, dialTimeoutMs);
      if (!socket) {
        opts.log('upstream-unreachable', { host: url.hostname, addresses: addresses.length });
        if (!res.headersSent) res.writeHead(502).end();
        return;
      }
      track(socket);
      const headers: IncomingHttpHeaders = { ...req.headers };
      for (const h of HOP_BY_HOP) delete headers[h];
      const upstream = httpRequest(
        {
          method: req.method,
          path: `${url.pathname}${url.search}`,
          headers,
          createConnection: () => socket,
        },
        (upRes) => {
          res.writeHead(upRes.statusCode ?? 502, upRes.headers);
          upRes.pipe(res);
        },
      );
      // Idle, not total: a slow but moving download is the page budget's business, not ours.
      upstream.setTimeout(upstreamIdleMs, () => {
        opts.log('upstream-timeout', { host: url.hostname, ms: upstreamIdleMs });
        upstream.destroy();
      });
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(504).end();
        else req.socket.destroy();
      });
      req.pipe(upstream);
    })();
  };

  const onConnect = (req: IncomingMessage, client: Duplex, head: Buffer): void => {
    track(client);
    client.on('error', () => client.destroy());
    void (async () => {
      let url: URL;
      try {
        // CONNECT targets are `host:port`; tunnels are only for TLS on 443 (https, wss).
        url = new URL(`https://${req.url ?? ''}`);
      } catch {
        client.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const addresses = await allowedAddresses(url, resolved, opts.lookup);
      if (addresses.length === 0) {
        refuse(url.hostname);
        client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }
      // Not an SSRF refusal, so not in `blocked`: the page sees a failed subrequest, nothing more.
      if (tunnels >= maxTunnels) {
        opts.log('tunnel-refused', { host: url.hostname, reason: 'limit', open: tunnels });
        client.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        return;
      }
      tunnels += 1;
      client.once('close', () => {
        tunnels -= 1;
      });
      const upstream = await dialFirst(addresses, 443, dial, dialTimeoutMs);
      if (!upstream) {
        opts.log('upstream-unreachable', { host: url.hostname, addresses: addresses.length });
        if (client.writable) client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        else client.destroy();
        return;
      }
      track(upstream);
      if (client.destroyed) {
        upstream.destroy();
        return;
      }
      const closeBoth = (): void => {
        client.destroy();
        upstream.destroy();
      };
      upstream.on('error', closeBoth);
      upstream.on('close', closeBoth);
      client.on('close', closeBoth);
      // One idle timer per side: traffic in either direction keeps the tunnel open.
      for (const side of [client, upstream]) {
        // The CONNECT client is typed Duplex but is a net.Socket in Node's http server.
        if (!(side instanceof Socket)) continue;
        side.setTimeout(tunnelIdleMs, () => {
          opts.log('tunnel-timeout', { host: url.hostname, ms: tunnelIdleMs });
          closeBoth();
        });
      }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    })();
  };

  const server = createServer(onRequest);
  server.on('connect', onConnect);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    server: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
