/**
 * Static form inspection (WS-4c): field types and names, method, action host,
 * pre-ticked boxes. Never submits a form and never reads a field's value.
 *
 * Not implemented yet: the shape is fixed now (WS-3e) and `inspectForms`
 * returns no forms until WS-4c.
 */

import type { Page } from 'playwright';

export interface FormInfo {
  pageUrl: string;
  method: 'get' | 'post' | 'dialog';
  actionHost?: string;
  actionScheme?: 'http' | 'https';
  fields: { type: string; name: string; autocomplete?: string; personal: boolean }[];
  /** Label at most 25 words. */
  checkboxes: { label: string; checked: boolean; consentLike: boolean }[];
}

export type InspectForms = (page: Page) => Promise<FormInfo[]>;

export const inspectForms: InspectForms = () => Promise.resolve([]);
