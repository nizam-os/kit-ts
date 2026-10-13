import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The extractor's test project; the root `vitest.config.ts` runs it and owns
 * coverage. Extraction is database code, so its tests run against PGlite
 * in-process, a real PostgreSQL. `@nizam-os/catalog-core` resolves to its
 * source through the `source` condition (see tsconfig.json).
 * @ref https://vitest.dev/guide/projects
 * @ref https://vite.dev/config/ssr-options#ssr-resolve-conditions
 */
const config: UserWorkspaceConfig = defineProject({
  ssr: {
    resolve: {
      conditions: ['source', 'module', 'node', 'development|production'],
    },
  },
  test: {
    name: '@nizam-os/pg-catalog',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});

export default config;
