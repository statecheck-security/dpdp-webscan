/**
 * The engine's only logger (WS-3b): one JSON line per event on stderr.
 *
 * Log hostnames, counts, codes and durations. Never cookie values, request
 * bodies, page text or full URLs with query strings; test/log.test.ts scans
 * every log call site in src/ for field names that suggest otherwise.
 */

export type LogFields = Record<string, string | number | boolean>;

export type Logger = (event: string, fields?: LogFields) => void;

export const log: Logger = (event, fields = {}) => {
  console.error(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
};

/** For tests and callers that want no output. */
export const silentLog: Logger = () => {};
