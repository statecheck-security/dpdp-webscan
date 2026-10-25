/**
 * Static form inspection (WS-4c): field types and names, method, action host
 * and scheme, ticked checkboxes. Feeds W6 and W8–W11.
 *
 * Never submits a form, never focuses or types into a field, and never reads
 * a field's value: the in-page function reads markup attributes and the
 * `checked` state only. Search forms are left out. Fields outside a <form>
 * element (script-driven widgets) are not seen.
 */

import type { Page } from 'playwright';
import { evaluateIn } from './browser.js';
import { CONSENT_CHECKBOX, PERSONAL_AUTOCOMPLETE, PERSONAL_FIELD, SEARCH_FIELD } from './data/keywords.js';
import { registrableDomain } from './pages.js';
import { pageUrlOf } from './urls.js';

export interface FormField {
  type: string;
  name: string;
  autocomplete?: string;
  personal: boolean;
}

export interface FormCheckbox {
  /** The field's name attribute, for evidence. */
  name: string;
  /** At most 25 words. Matched only; never copied into a result (ground rule 3). */
  label: string;
  checked: boolean;
  consentLike: boolean;
}

export interface FormInfo {
  /** The page the form is on, recorded like every page URL (src/urls.ts). */
  pageUrl: string;
  method: 'get' | 'post' | 'dialog';
  actionHost?: string;
  actionScheme?: 'http' | 'https';
  /** The action's registrable domain differs from the page's (extra pages are always same-site). */
  actionThirdParty: boolean;
  /**
   * No method and no action attribute: almost always a form a script submits (often by POST), so
   * the browser's default GET says nothing about what it sends (W11 skips it).
   */
  scriptHandled: boolean;
  /** Every named or typed field except buttons and hidden inputs; checkboxes are in `checkboxes` too. */
  fields: FormField[];
  checkboxes: FormCheckbox[];
}

export type InspectForms = (page: Page) => Promise<FormInfo[]>;

const MAX_FORMS = 20;
const MAX_FIELDS_PER_FORM = 50;
const MAX_NAME_CHARS = 100;
const MAX_LABEL_WORDS = 25;

interface Pattern {
  source: string;
  flags: string;
}

interface InPageArgs {
  personalField: Pattern;
  personalAutocomplete: Pattern;
  consentCheckbox: Pattern;
  searchField: Pattern;
  maxForms: number;
  maxFields: number;
  maxName: number;
  maxLabelWords: number;
}

interface InPageForm {
  method: string;
  action: string;
  scriptHandled: boolean;
  fields: FormField[];
  checkboxes: FormCheckbox[];
}

const pattern = (re: RegExp): Pattern => ({ source: re.source, flags: re.flags });

/** Runs in the page. Self-contained; reads attributes and `checked`, never `value`. */
function inPage(a: InPageArgs): InPageForm[] {
  const re = (p: Pattern): RegExp => new RegExp(p.source, p.flags);
  const personalField = re(a.personalField);
  const personalAutocomplete = re(a.personalAutocomplete);
  const consentCheckbox = re(a.consentCheckbox);
  const searchField = re(a.searchField);
  const skipped = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
  const attr = (el: Element, name: string): string => (el.getAttribute(name) ?? '').slice(0, a.maxName);
  const words = (s: string): string => s.replace(/\s+/g, ' ').trim().split(' ').slice(0, a.maxLabelWords).join(' ');

  const labelOf = (el: Element): string => {
    const id = el.getAttribute('id');
    const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const wrapping = el.closest('label');
    const text = (byFor ?? wrapping)?.textContent ?? el.getAttribute('aria-label') ?? '';
    return words(text);
  };

  const forms: InPageForm[] = [];
  for (const form of [...document.querySelectorAll('form')].slice(0, a.maxForms)) {
    const fields: FormField[] = [];
    const checkboxes: FormCheckbox[] = [];
    for (const el of [...form.querySelectorAll('input, select, textarea')].slice(0, a.maxFields)) {
      const type = el.tagName === 'INPUT' ? (attr(el, 'type') || 'text').toLowerCase() : el.tagName.toLowerCase();
      if (skipped.has(type)) continue;
      const name = attr(el, 'name');
      const autocomplete = attr(el, 'autocomplete').toLowerCase();
      const hints = `${name} ${attr(el, 'id')} ${attr(el, 'placeholder')} ${attr(el, 'aria-label')}`;
      const personal =
        type === 'email' ||
        type === 'tel' ||
        autocomplete.split(/\s+/).some((t) => personalAutocomplete.test(t)) ||
        personalField.test(hints);
      fields.push({ type, name, ...(autocomplete ? { autocomplete } : {}), personal });
      if (type === 'checkbox' && el instanceof HTMLInputElement) {
        const label = labelOf(el);
        checkboxes.push({ name, label, checked: el.checked, consentLike: consentCheckbox.test(`${label} ${name}`) });
      }
    }
    // A search box (one text-like field named q, s, search …) is not a personal-data form.
    const typed = fields.filter((f) => f.type !== 'checkbox' && f.type !== 'radio');
    const only = typed[0];
    if (typed.length === 1 && only && (only.type === 'search' || searchField.test(only.name))) continue;
    // Attributes, not form.method / form.action: a field named "action" shadows the property.
    let action: string;
    try {
      action = new URL(form.getAttribute('action') ?? '', document.baseURI).href;
    } catch {
      action = '';
    }
    forms.push({
      method: (form.getAttribute('method') ?? 'get').toLowerCase(),
      action,
      scriptHandled: !form.hasAttribute('method') && !form.hasAttribute('action'),
      fields,
      checkboxes,
    });
  }
  return forms;
}

function toFormInfo(pageUrl: string, form: InPageForm): FormInfo {
  const method = form.method === 'post' || form.method === 'dialog' ? form.method : 'get';
  let action: URL | undefined;
  try {
    action = new URL(form.action);
  } catch {
    action = undefined;
  }
  const scheme = action?.protocol === 'http:' ? 'http' : action?.protocol === 'https:' ? 'https' : undefined;
  const actionHost = scheme && action ? action.hostname.toLowerCase() : undefined;
  return {
    pageUrl,
    method,
    ...(scheme && actionHost ? { actionHost, actionScheme: scheme } : {}),
    actionThirdParty:
      actionHost !== undefined && registrableDomain(actionHost) !== registrableDomain(new URL(pageUrl).hostname),
    scriptHandled: form.scriptHandled,
    fields: form.fields,
    checkboxes: form.checkboxes,
  };
}

export const inspectForms: InspectForms = async (page) => {
  // Recorded like every page URL the engine keeps (src/urls.ts).
  const pageUrl = pageUrlOf(new URL(page.url()));
  const forms = await evaluateIn(page, inPage, {
    personalField: pattern(PERSONAL_FIELD),
    personalAutocomplete: pattern(PERSONAL_AUTOCOMPLETE),
    consentCheckbox: pattern(CONSENT_CHECKBOX),
    searchField: pattern(SEARCH_FIELD),
    maxForms: MAX_FORMS,
    maxFields: MAX_FIELDS_PER_FORM,
    maxName: MAX_NAME_CHARS,
    maxLabelWords: MAX_LABEL_WORDS,
  });
  return forms.map((f) => toFormInfo(pageUrl, f));
};
