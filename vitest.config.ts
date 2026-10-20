// Long timeouts are for *.browser.test.ts (Chromium start-up, 20 s page loads).
// `forks` avoids the flaky first run seen with worker threads on the Windows dev box (CLAUDE.md).
// Default export because vitest requires it.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
