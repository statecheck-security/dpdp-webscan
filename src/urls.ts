/**
 * The one rule for how a page URL is recorded (review fixes, 2026-10-25): origin and path, plus the
 * query only where the query names the page. Used for every page URL the engine keeps (pages, page
 * text keys, request and form page URLs, the result's target), so they all agree.
 *
 * Query strings can carry identifiers, so they are dropped by default. They are kept only on a
 * front-controller path (`/`, `index.php`, `page.aspx` …), where they choose the page
 * (WordPress plain permalinks: `/?page_id=3`), and only when what is left after dropping
 * campaign and click ids is short and plain enough to pass assertRedacted (src/result.ts).
 */

/** `name=` followed by a long token: a cookie, query or form value that slipped through (assertRedacted). */
export const VALUE_TOKEN = /=\S{16,}/;

/** Paths whose query picks the page: the site root, or a script file. */
const FRONT_CONTROLLER = /(^\/$|\.(php|aspx?|jsp|cfm)$|\/index\.html?$)/i;
/** Campaign and click ids: never part of which page it is. */
const TRACKING_PARAM = /^(utm_\w+|gclid|gbraid|wbraid|fbclid|msclkid|dclid|yclid|mc_cid|mc_eid|_ga|_gl|ref|source)$/i;
const MAX_PARAMS = 2;
const PLAIN_NAME = /^[a-z_][\w-]{0,29}$/i;
const PLAIN_VALUE = /^[\w.-]{1,12}$/;

/** The query to keep for `url`, with its `?`, or '' when none is kept. */
function pageQuery(url: URL): string {
  if (!FRONT_CONTROLLER.test(url.pathname)) return '';
  const params = [...url.searchParams].filter(([name]) => !TRACKING_PARAM.test(name));
  if (params.length === 0 || params.length > MAX_PARAMS) return '';
  if (!params.every(([name, value]) => PLAIN_NAME.test(name) && PLAIN_VALUE.test(value))) return '';
  const query = `?${new URLSearchParams(params).toString()}`;
  return VALUE_TOKEN.test(query) ? '' : query;
}

/** The recorded form of a page URL. Hash always dropped. */
export function pageUrlOf(url: URL): string {
  return `${url.origin}${url.pathname}${pageQuery(url)}`;
}

/** As pageUrlOf, for a string; undefined for anything that is not http(s). */
export function pageUrlOfString(href: string): string | undefined {
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return pageUrlOf(url);
  } catch {
    return undefined;
  }
}
