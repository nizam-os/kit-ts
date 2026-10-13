import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The runtime's test project; the root `vitest.config.ts` runs it and owns
 * coverage. The workspace packages it builds on resolve to their source
 * through the `source` condition (see tsconfig.json), so the tests run
 * without a build and against those packages as they are edited. Tests
 * that need a database run on PGlite.
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
    name: '@nizam-os/kysely-resource',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 30_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});

export default config;
