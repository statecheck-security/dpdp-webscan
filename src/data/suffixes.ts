/**
 * Hand-kept multi-label public suffixes for the eTLD+1 check (plan section 4,
 * "eTLD+1 source": hand list until a real scan misclassifies). Single-label
 * TLDs (`in`, `com`, …) are implicit. Shaped as one set so a list generated
 * from the Public Suffix List can replace it without touching src/pages.ts.
 */

/** Second-level registries: a site registers `name.<suffix>`. */
const REGISTRY_SUFFIXES = [
  // India (registry.in)
  'co.in',
  'firm.in',
  'net.in',
  'org.in',
  'gen.in',
  'ind.in',
  'ac.in',
  'edu.in',
  'res.in',
  'gov.in',
  'mil.in',
  'nic.in',
  // Common elsewhere
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.sg',
  'com.my',
  'co.jp',
  'com.br',
  'co.za',
  'com.cn',
];

/**
 * Hosting platforms where each subdomain belongs to a different owner (the
 * PSL's private section). Without them, `a.vercel.app` and `b.vercel.app`
 * would count as one site and we would follow links between them.
 */
const PLATFORM_SUFFIXES = [
  'github.io',
  'vercel.app',
  'netlify.app',
  'pages.dev',
  'workers.dev',
  'herokuapp.com',
  'blogspot.com',
  'web.app',
  'firebaseapp.com',
  'azurewebsites.net',
  'cloudfront.net',
  'onrender.com',
  'up.railway.app',
  'wixsite.com',
  'myshopify.com',
  'wordpress.com',
];

export const PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([...REGISTRY_SUFFIXES, ...PLATFORM_SUFFIXES]);
