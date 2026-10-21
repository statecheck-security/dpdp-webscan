/**
 * Same-site rules (WS-3c, needed by the capture) and, in WS-3d, page discovery
 * by link text and robots.txt. "Same site" is the same registrable domain
 * (eTLD+1) from the hand-kept list in src/data/suffixes.ts (plan section 4).
 */

import { isIP } from 'node:net';
import { PUBLIC_SUFFIXES } from './data/suffixes.js';

function normaliseHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/^\.+|\.+$/g, '');
}

/**
 * The registrable domain of a host: the longest known public suffix plus one
 * label, or the last two labels when no listed suffix matches. IP literals and
 * single-label hosts are returned as they are.
 */
export function registrableDomain(host: string): string {
  const name = normaliseHost(host);
  if (isIP(name) !== 0) return name;
  const labels = name.split('.');
  // The smallest index is the longest suffix, so the first match wins.
  for (let i = 1; i < labels.length; i += 1) {
    if (PUBLIC_SUFFIXES.has(labels.slice(i).join('.'))) return labels.slice(i - 1).join('.');
  }
  return labels.slice(-2).join('.');
}

/** True when `url` is http(s) on the same registrable domain as `target`. */
export function sameSite(url: URL, target: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return registrableDomain(url.hostname) === registrableDomain(target.hostname);
}
