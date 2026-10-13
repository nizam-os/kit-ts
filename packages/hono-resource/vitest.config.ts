import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The routes' test project; the root `vitest.config.ts` runs it and owns
 * coverage. The workspace packages it builds on resolve to their source
 * through the `source` condition (see tsconfig.json), so the tests run
 * without a build and against those packages as they are edited. The
 * routes run over a runtime of the contract held in memory, through
 * `app.request`.
 * @ref https://vitest.dev/guide/projects
 * @ref https://vite.dev/config/ssr-options#ssr-resolve-conditions
 * @ref https://hono.dev/docs/guides/testing
 */
const config: UserWorkspaceConfig = defineProject({
  ssr: {
    resolve: {
      conditions: ['source', 'module', 'node', 'development|production'],
    },
  },
  test: {
    name: '@nizam-os/hono-resource',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});

export default config;
