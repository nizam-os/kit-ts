import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The core's test project; the root `vitest.config.ts` runs it and owns
 * coverage. `@nizam-os/ban-core` resolves to its source through the `source`
 * condition (see tsconfig.json), so the tests run against the error core as
 * it is edited and the combined coverage attributes core lines they execute.
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
    name: '@nizam-os/jsonapi-core',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    // The conformance tests compile the vendored JSON:API schema with Ajv on
    // first use; on a two-core CI runner with coverage instrumentation and one
    // worker per file that can pass Vitest's 5 s default. Same headroom as e2e/jsonapi/.
    testTimeout: 20_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});

export default config;
