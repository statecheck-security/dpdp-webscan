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
 */

import { createServer, request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { connect, isIP } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
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

export interface EgressProxyOptions {
  lookup?: Lookup;
  log: Logger;
  dial?: Dial;
  /** Shared with the route guard so one list holds every refusal of a context. */
  blocked: BlockedRequest[];
}

export interface EgressProxy {
  /** `http://127.0.0.1:<port>`, for the context's `proxy.server`. */
  server: string;
  close: () => Promise<void>;
}

const HOP_BY_HOP = ['proxy-connection', 'proxy-authorization', 'connection', 'keep-alive'];

/**
 * Check a URL against the guard and return the address to dial, or undefined
 * when it is refused. Public IP literals are dialled as they are.
 */
export async function allowedAddress(
  url: URL,
  resolved: Map<string, Promise<string[]>>,
  lookup?: Lookup,
): Promise<string | undefined> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.port !== '' || url.username || url.password) return undefined;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return isBlockedAddress(host) ? undefined : host;
  try {
    parseTarget(url.href);
  } catch {
    return undefined;
  }
  let pending = resolved.get(host);
  if (!pending) {
    pending = resolvePublic(host, lookup);
    resolved.set(host, pending);
  }
  try {
    return (await pending)[0];
  } catch {
    return undefined;
  }
}

export async function startEgressProxy(opts: EgressProxyOptions): Promise<EgressProxy> {
  const dial = opts.dial ?? defaultDial;
  const resolved = new Map<string, Promise<string[]>>();
  const sockets = new Set<Duplex>();

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
      const address = await allowedAddress(url, resolved, opts.lookup);
      if (!address) {
        refuse(url.hostname);
        req.socket.destroy();
        return;
      }
      const headers: IncomingHttpHeaders = { ...req.headers };
      for (const h of HOP_BY_HOP) delete headers[h];
      const upstream = httpRequest(
        {
          method: req.method,
          path: `${url.pathname}${url.search}`,
          headers,
          createConnection: () => dial(address, 80),
        },
        (upRes) => {
          res.writeHead(upRes.statusCode ?? 502, upRes.headers);
          upRes.pipe(res);
        },
      );
      upstream.on('error', () => req.socket.destroy());
      req.pipe(upstream);
    })();
  };

  const onConnect = (req: IncomingMessage, client: Duplex, head: Buffer): void => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
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
      const address = await allowedAddress(url, resolved, opts.lookup);
      if (!address) {
        refuse(url.hostname);
        client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }
      const upstream = dial(address, 443);
      sockets.add(upstream);
      upstream.on('close', () => sockets.delete(upstream));
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length > 0) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on('error', () => {
        if (client.writable) client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        else client.destroy();
      });
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
