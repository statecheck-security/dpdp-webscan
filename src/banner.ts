/**
 * Consent-banner detection and the only clicks the engine ever makes (WS-4b).
 *
 * One function runs inside the page (`inPage`) in three modes: find the first
 * layer, list the controls of the layer a settings click opened, and look
 * for a persistent "change your choice" control. It tags the banner and its
 * controls with data attributes, so a click goes to exactly the element we
 * classified; Playwright's CSS pierces open shadow roots, and so does the
 * walk in `inPage`. Banners in a consent frame (a known CMP's domain, or the
 * site's own) are found and clicked inside that frame (WS-11c); banners in any
 * other frame, an about:blank frame or a closed shadow root are not found
 * (the `banner` info item then says no banner was seen).
 *
 * Rules: never click anything outside the banner (its CMP container, a
 * consent dialog it opened, or the consent frame it is drawn in); at most 2 clicks per run, below the 3 the plan
 * allows; never submit a form. A settings click that leaves the page opened
 * no consent layer, so the run stops there (WS-11b).
 */

import type { Frame, Page } from 'playwright';
import { evaluateIn } from './browser.js';
import { CMP_FRAMES, CMPS, CONTROLS, DIALOGS, FRAME_MIN_COVERAGE, GENERIC_BANNER } from './data/cmps.js';
import type { CmpFrame, CmpSelectors } from './data/cmps.js';
import { BANNER_TEXT, BUTTON_ROLES, CMP_SETTINGS, PERSISTENT_CONTROL, SAVE_CHOICES } from './data/keywords.js';
import { registrableDomain } from './pages.js';

export type ButtonRole = 'accept' | 'reject' | 'settings' | 'other';

export interface BannerButton {
  label: string;
  role: ButtonRole;
  visible: boolean;
  clicksFromFirstLayer: number;
  /** Marker findBanner set on the element, so a click reaches the control we classified. */
  ref: string;
}

export interface BannerInfo {
  vendor?: string;
  /** At most 400 characters; matched by checks, never copied whole into a result. */
  text: string;
  buttons: BannerButton[];
  /** The consent frame the banner was found in (WS-11c); its clicks go there. Internal, never in a result. */
  frame?: Frame;
}

/** `clicks` counts every click the run made, the settings click included. */
export type ClickOutcome = { clicked: true; clicks: number } | { clicked: false; reason: 'no-control' | 'failed' };

export type FindBanner = (page: Page) => Promise<BannerInfo | undefined>;
export type ClickBanner = (page: Page, banner: BannerInfo) => Promise<ClickOutcome>;
/** Resolves true when a persistent "cookie settings" style control is on the page, outside the banner. */
export type FindPersistentControl = (page: Page) => Promise<boolean>;

const BANNER_ATTR = 'data-statecheck-banner';
const CONTROL_ATTR = 'data-statecheck-control';
const MAX_TEXT_CHARS = 400;
const MAX_LABEL_CHARS = 80;
/** A generic match with more text than this is a page section, not a banner. */
const MAX_GENERIC_TEXT_CHARS = 3_000;
const CLICK_TIMEOUT_MS = 3_000;
/** After a settings click, time for the preferences layer to open. */
const LAYER_WAIT_MS = 1_000;
/** How long findBanner keeps looking for a banner drawn after the page settled (WS-11b). */
export const BANNER_WAIT_MS = 3_000;
const BANNER_POLL_MS = 500;

interface Pattern {
  source: string;
  flags: string;
}

interface InPageArgs {
  /** `layer`: like `second`, over the whole document; used inside a consent frame, which is all banner. */
  mode: 'first' | 'second' | 'layer' | 'persistent';
  cmps: readonly CmpSelectors[];
  generic: string;
  dialogs: string;
  controls: string;
  bannerAttr: string;
  controlAttr: string;
  bannerText: Pattern;
  roles: { role: Exclude<ButtonRole, 'other'>; label: Pattern }[];
  /** Settings labels counted only inside a known CMP's banner (CMP_SETTINGS). */
  cmpSettings: Pattern;
  persistent: Pattern;
  maxText: number;
  maxLabel: number;
  maxGenericText: number;
}

interface InPageControl {
  ref: string;
  label: string;
  role: ButtonRole;
}

interface InPageResult {
  vendor?: string;
  text: string;
  controls: InPageControl[];
  /** Second layer: an optional purpose is switched on, so "save" could mean "accept". */
  optionalOn: boolean;
  /** Persistent mode: a control for changing consent later was found. */
  persistent: boolean;
}

const pattern = (re: RegExp): Pattern => ({ source: re.source, flags: re.flags });

function args(mode: InPageArgs['mode']): InPageArgs {
  return {
    mode,
    cmps: CMPS,
    generic: GENERIC_BANNER,
    dialogs: DIALOGS,
    controls: CONTROLS,
    bannerAttr: BANNER_ATTR,
    controlAttr: CONTROL_ATTR,
    bannerText: pattern(BANNER_TEXT),
    roles: BUTTON_ROLES.map((r) => ({ role: r.role, label: pattern(r.label) })),
    cmpSettings: pattern(CMP_SETTINGS),
    persistent: pattern(PERSISTENT_CONTROL),
    maxText: MAX_TEXT_CHARS,
    maxLabel: MAX_LABEL_CHARS,
    maxGenericText: MAX_GENERIC_TEXT_CHARS,
  };
}

/** Runs in the page. Self-contained: Playwright serialises only this function. */
function inPage(a: InPageArgs): InPageResult | undefined {
  const re = (p: Pattern): RegExp => new RegExp(p.source, p.flags);
  const bannerText = re(a.bannerText);
  const roles = a.roles.map((r) => ({ role: r.role, label: re(r.label) }));
  const cmpSettings = re(a.cmpSettings);
  const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

  const deepAll = (root: Document | Element | ShadowRoot, selector: string): Element[] => {
    const out: Element[] = [];
    try {
      out.push(...root.querySelectorAll(selector));
    } catch {
      return out;
    }
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...deepAll(el.shadowRoot, selector));
    return out;
  };
  const parentOf = (el: Element): Element | null => {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };
  const visible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      el.checkVisibility({
        visibilityProperty: true,
        opacityProperty: true,
        checkVisibilityCSS: true,
        checkOpacity: true,
      })
    );
  };
  const textOf = (el: Element): string => collapse(el instanceof HTMLElement ? el.innerText : (el.textContent ?? ''));
  const labelOf = (el: Element): string =>
    collapse(
      el.getAttribute('aria-label') ||
        textOf(el) ||
        (el instanceof HTMLInputElement ? el.value : '') ||
        el.getAttribute('title') ||
        '',
    ).slice(0, a.maxLabel);
  const roleOf = (label: string, cmp = false): ButtonRole =>
    roles.find((r) => r.label.test(label))?.role ?? (cmp && cmpSettings.test(label) ? 'settings' : 'other');
  const within = (el: Element, roots: Element[]): boolean => {
    for (let n: Element | null = el; n; n = parentOf(n)) if (roots.includes(n)) return true;
    return false;
  };
  const controlsIn = (scope: Element, cmp = false): Element[] =>
    [...new Set(deepAll(scope, a.controls))].filter((el) => {
      if (!visible(el)) return false;
      // A plain link is a control only when it names a choice (e.g. "Got it"), never a policy link.
      const plainLink = el.tagName === 'A' && el.getAttribute('role') !== 'button';
      return !plainLink || roleOf(labelOf(el), cmp) !== 'other';
    });
  const positioned = (el: Element): boolean => {
    for (let n: Element | null = el; n; n = parentOf(n)) {
      const position = getComputedStyle(n).position;
      if (position === 'fixed' || position === 'sticky') return true;
    }
    return false;
  };
  const unmark = (attr: string, prefix = ''): void => {
    for (const el of deepAll(document, `[${attr}^="${prefix}"]`)) el.removeAttribute(attr);
  };
  const markControls = (els: Element[], prefix: string, cmp = false): InPageControl[] => {
    unmark(a.controlAttr, prefix);
    return els.map((el, i) => {
      const ref = `${prefix}${i}`;
      el.setAttribute(a.controlAttr, ref);
      const label = labelOf(el);
      return { ref, label, role: roleOf(label, cmp) };
    });
  };
  const empty = { text: '', controls: [], optionalOn: false, persistent: false };

  if (a.mode === 'first') {
    unmark(a.bannerAttr);
    const describe = (el: Element, vendor: string | undefined, root: string | undefined): InPageResult => {
      el.setAttribute(a.bannerAttr, '1');
      if (root) for (const r of deepAll(document, root)) r.setAttribute(a.bannerAttr, '1');
      return {
        ...empty,
        ...(vendor ? { vendor } : {}),
        text: textOf(el).slice(0, a.maxText),
        controls: markControls(controlsIn(el, vendor !== undefined), 'b', vendor !== undefined),
      };
    };
    for (const cmp of a.cmps) {
      for (const el of deepAll(document, cmp.banner)) {
        if (visible(el) && controlsIn(el, true).length > 0) return describe(el, cmp.vendor, cmp.root);
      }
    }
    const candidates: { el: Element; rank: number; length: number }[] = [];
    for (const match of deepAll(document, a.generic)) {
      // A match is often the text inside the banner; climb a little to the box that holds the controls.
      let el: Element | null = match;
      for (let i = 0; el && i < 4 && controlsIn(el).length === 0; i += 1) el = parentOf(el);
      if (!el || el === document.body || el === document.documentElement || !visible(el)) continue;
      const text = textOf(el);
      if (text.length > a.maxGenericText || !bannerText.test(text)) continue;
      const found = controlsIn(el).map((c) => roleOf(labelOf(c)));
      if (!found.includes('accept') && !found.includes('reject')) continue;
      const floating = positioned(el) || el.matches(a.dialogs);
      if (!floating && el.getBoundingClientRect().top >= innerHeight) continue;
      candidates.push({ el, rank: floating ? 0 : 1, length: text.length });
    }
    candidates.sort((x, y) => x.rank - y.rank || x.length - y.length);
    const best = candidates[0];
    return best ? describe(best.el, undefined, undefined) : undefined;
  }

  if (a.mode === 'second' || a.mode === 'layer') {
    const scopes =
      a.mode === 'layer'
        ? [document.body]
        : [
            ...deepAll(document, `[${a.bannerAttr}]`),
            ...deepAll(document, a.dialogs).filter((d) => visible(d) && bannerText.test(textOf(d))),
          ];
    const controls = [...new Set(scopes.flatMap((s) => controlsIn(s)))];
    const switches =
      'input[type="checkbox"]:checked:not(:disabled), [role="switch"][aria-checked="true"]:not([aria-disabled="true"])';
    return {
      ...empty,
      ...(a.mode === 'layer' ? { text: textOf(document.body).slice(0, a.maxText) } : {}),
      controls: markControls(controls, 's'),
      optionalOn: scopes.some((s) => deepAll(s, switches).length > 0),
    };
  }

  // Persistent: a CMP's own reopen control counts even while hidden (most show it only after a
  // choice); otherwise a visible control outside the banner whose label offers to change consent.
  if (a.cmps.some((c) => c.revisit !== undefined && deepAll(document, c.revisit).length > 0)) {
    return { ...empty, persistent: true };
  }
  const banners = [
    ...deepAll(document, `[${a.bannerAttr}]`),
    ...a.cmps.flatMap((c) => deepAll(document, `${c.banner}, ${c.root}`)),
  ];
  const persistent = re(a.persistent);
  const found = deepAll(document, 'a[href], button, [role="button"]').some(
    (el) => !within(el, banners) && visible(el) && persistent.test(labelOf(el)),
  );
  return { ...empty, persistent: found };
}

async function inspect(target: Page | Frame, mode: InPageArgs['mode']): Promise<InPageResult | undefined> {
  return evaluateIn(target, inPage, args(mode));
}

async function click(target: Page | Frame, ref: string): Promise<boolean> {
  try {
    await target.locator(`[${CONTROL_ATTR}="${ref}"]`).first().click({ timeout: CLICK_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

const NO_CONTROL: ClickOutcome = { clicked: false, reason: 'no-control' };
const FAILED: ClickOutcome = { clicked: false, reason: 'failed' };

/** A preferences-layer control that saves the choices as shown, not one that accepts everything. */
function savesChoices(label: string): boolean {
  return SAVE_CHOICES.test(label) && !/\ball\b/i.test(label);
}

/**
 * Where a child frame comes from, if it may be searched for a banner (WS-11c):
 * a known CMP's domain (with its vendor), or the scanned site itself.
 * Undefined for anything else: a frame from another company is never searched
 * or clicked, since a click there would be a click outside the banner.
 */
export function frameSource(
  frameUrl: string,
  pageUrl: string,
  frames: readonly CmpFrame[] = CMP_FRAMES,
): { vendor?: string } | undefined {
  let frame: URL;
  let page: URL;
  try {
    frame = new URL(frameUrl);
    page = new URL(pageUrl);
  } catch {
    return undefined;
  }
  // about:blank, srcdoc and data: frames carry no provenance we can check.
  if (frame.protocol !== 'https:' && frame.protocol !== 'http:') return undefined;
  const host = frame.hostname.toLowerCase();
  const cmp = frames.find((f) => host === f.host || host.endsWith(`.${f.host}`));
  if (cmp) return { vendor: cmp.vendor };
  return registrableDomain(host) === registrableDomain(page.hostname.toLowerCase()) ? {} : undefined;
}

interface ConsentFrame {
  frame: Frame;
  vendor?: string;
}

/** Direct child frames that may hold the banner: allowed by frameSource, visible, and floating or large. */
async function consentFrames(page: Page, frames: readonly CmpFrame[]): Promise<ConsentFrame[]> {
  const out: ConsentFrame[] = [];
  for (const frame of page.mainFrame().childFrames()) {
    if (frame.isDetached()) continue;
    const source = frameSource(frame.url(), page.url(), frames);
    if (!source) continue;
    const handle = await frame.frameElement().catch(() => undefined);
    if (!handle) continue;
    let shown: boolean;
    try {
      // Anonymous and flat on purpose: tsx's keepNames would wrap a named inner function (decision 22).
      shown = await handle.evaluate((node, minCoverage) => {
        // frameElement() is the <iframe> element; Playwright types it as a Node.
        const el = node as Element;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false;
        }
        for (let n: Element | null = el; n; n = n.parentElement) {
          const position = getComputedStyle(n).position;
          if (position === 'fixed' || position === 'sticky') return true;
        }
        const covered = Math.min(rect.width, innerWidth) * Math.min(rect.height, innerHeight);
        return covered / (innerWidth * innerHeight) >= minCoverage;
      }, FRAME_MIN_COVERAGE);
    } catch {
      shown = false;
    } finally {
      await handle.dispose().catch(() => undefined);
    }
    if (shown) out.push({ frame, ...(source.vendor ? { vendor: source.vendor } : {}) });
  }
  return out;
}

function toBanner(found: InPageResult, consent?: ConsentFrame): BannerInfo {
  const vendor = found.vendor ?? consent?.vendor;
  return {
    ...(vendor ? { vendor } : {}),
    text: found.text,
    buttons: found.controls.map((c) => ({ ...c, visible: true, clicksFromFirstLayer: 1 })),
    ...(consent ? { frame: consent.frame } : {}),
  };
}

/** A known CMP's frame is all banner: when the generic rule finds no box in it, take the whole document. */
async function bannerInFrame(consent: ConsentFrame): Promise<BannerInfo | undefined> {
  const found = await inspect(consent.frame, 'first');
  if (found) return toBanner(found, consent);
  if (!consent.vendor) return undefined;
  const layer = await inspect(consent.frame, 'layer');
  const choices = layer?.controls.filter((c) => c.role === 'accept' || c.role === 'reject') ?? [];
  return layer && choices.length > 0 ? toBanner(layer, consent) : undefined;
}

/**
 * A findBanner that keeps looking for up to `waitMs` (WS-11b). Many CMPs draw
 * the banner only after their script loads, which can be after network idle;
 * looking once read those sites as "no banner" and skipped W3–W7. Each round
 * also searches the consent frames (WS-11c); `frames` lists the CMP frame
 * domains, and tests add their fixture CMP.
 */
export function bannerFinder(waitMs = BANNER_WAIT_MS, frames: readonly CmpFrame[] = CMP_FRAMES): FindBanner {
  return async (page) => {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const found = await inspect(page, 'first');
      if (found) return toBanner(found);
      for (const consent of await consentFrames(page, frames)) {
        const inFrame = await bannerInFrame(consent).catch(() => undefined);
        if (inFrame) return inFrame;
      }
      const left = deadline - Date.now();
      if (left <= 0) return undefined;
      await new Promise((resolve) => setTimeout(resolve, Math.min(BANNER_POLL_MS, left)));
    }
  };
}

export const findBanner: FindBanner = bannerFinder();

/** The page's URL without its fragment: a `#` settings link is not a navigation. */
function pageAddress(page: Page): string {
  const url = new URL(page.url());
  url.hash = '';
  return url.href;
}

/**
 * Reject on the first layer if it is there; else open settings and reject
 * (or save with every optional purpose off) on the layer that opens. A banner
 * in a consent frame is clicked inside that frame, and its second layer is
 * the frame's whole document.
 */
export const clickReject: ClickBanner = async (page, banner) => {
  const target = banner.frame ?? page;
  const reject = banner.buttons.find((b) => b.role === 'reject');
  if (reject) return (await click(target, reject.ref)) ? { clicked: true, clicks: 1 } : FAILED;
  const settings = banner.buttons.find((b) => b.role === 'settings');
  if (!settings) return NO_CONTROL;
  const before = pageAddress(page);
  if (!(await click(target, settings.ref))) return FAILED;
  await new Promise((resolve) => setTimeout(resolve, LAYER_WAIT_MS));
  // A "settings" control that leaves the page opened no consent layer: there is no reject behind it (WS-11b).
  if (pageAddress(page) !== before) return NO_CONTROL;
  const layer = await inspect(target, banner.frame ? 'layer' : 'second');
  if (!layer) return FAILED;
  const next =
    layer.controls.find((c) => c.role === 'reject') ??
    (layer.optionalOn ? undefined : layer.controls.find((c) => savesChoices(c.label)));
  if (!next) return NO_CONTROL;
  return (await click(target, next.ref)) ? { clicked: true, clicks: 2 } : FAILED;
};

export const clickAccept: ClickBanner = async (page, banner) => {
  const accept = banner.buttons.find((b) => b.role === 'accept');
  if (!accept) return NO_CONTROL;
  return (await click(banner.frame ?? page, accept.ref)) ? { clicked: true, clicks: 1 } : FAILED;
};

export const findPersistentControl: FindPersistentControl = async (page) => {
  // Tag the banner first, so its own "settings" button is not taken for a persistent control.
  await inspect(page, 'first');
  return (await inspect(page, 'persistent'))?.persistent ?? false;
};
