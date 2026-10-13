import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The model's test project; the root `vitest.config.ts` runs it and owns
 * coverage. `@nizam-os/resource-core` resolves to its source through the
 * `source` condition (see tsconfig.json), so the tests declare the fixture's
 * resources and messages against the core as it is edited. No test renders:
 * the model imports no framework, and its type tests read TanStack Table
 * v9's state types from `@tanstack/table-core`.
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
    name: '@nizam-os/resource-ui',
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
