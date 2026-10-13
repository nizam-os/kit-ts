import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The binding's test project; the root `vitest.config.ts` runs it and owns
 * coverage. `@nizam-os/resource-ui` and `@nizam-os/resource-core` resolve to
 * their source through the `source` condition (see tsconfig.json), so the
 * tests declare their resources and messages against the cores as they
 * are edited. The tests drive a form-core `FormApi` and its `FieldApi`s,
 * which every adapter's forms and fields are made of, so no test imports
 * a framework.
 * @ref https://vitest.dev/guide/projects
 * @ref https://vite.dev/config/ssr-options#ssr-resolve-conditions
 */
const config: UserWorkspaceConfig = defineProject({
  // Vitest runs the node environment through Vite's SSR pipeline, whose
  // resolver reads `ssr.resolve.conditions`, not the client-side
  // `resolve.conditions`. `source` is prepended to Vite's server defaults.
  ssr: {
    resolve: {
      conditions: ['source', 'module', 'node', 'development|production'],
    },
  },
  test: {
    name: '@nizam-os/tanstack-form-resource',
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
