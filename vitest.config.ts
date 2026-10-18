import type { ViteUserConfig } from 'vitest/config';

import { defineConfig } from 'vitest/config';

/**
 * One Vitest run over every package's project (`packages/x/vitest.config.ts`)
 * and the repository's scripts (the inline `scripts` project).
 * Coverage is a whole-process concern that Vitest configures only here, so
 * the thresholds apply to the combined source of all packages.
 * @ref https://vitest.dev/guide/projects
 * @ref https://vitest.dev/config/
 */
const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      'packages/*',
      { test: { name: 'scripts', include: ['scripts/**/*.test.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'scripts/**/*.ts'],
      // Tests, the repository's own test helpers, and the files that hold
      // re-exports only: every package's root barrel, the nested barrels of
      // the jsonapi and keyset packages, and the one-line twins in
      // @nizam-os/hono-ban of each @nizam-os/ban-core subpath. The nested
      // index files of @nizam-os/ban-core implement its subpaths and stay in.
      // The pg-catalog bin only hands the process to runCli; the catalog
      // e2e suite runs it as a built bin. The storage contract's cases, and
      // the list data and walks they page through, need a database: the
      // resource e2e suite runs each case, and each defect a case must
      // catch, against its reference adapter through the built package. The
      // scripts' entry points only hand the repository, or the release
      // directory, to the checks; CI runs them. The release scripts' test
      // support builds their fixtures.
      exclude: [
        'packages/*/src/**/*.test.ts',
        'scripts/**/*.test.ts',
        'scripts/peer-floors/{check-jobs,audit-advisories}.ts',
        'scripts/release/{pack,publish,github-release}.ts',
        'scripts/release/test-support.ts',
        'packages/*/src/**/*.test-d.ts',
        'packages/*/src/test-support/**',
        'packages/*/src/index.ts',
        'packages/pg-catalog/src/cli.ts',
        'packages/resource-core/src/testing/storage-contract.ts',
        'packages/resource-core/src/testing/contract/{context,list-data,list-walk,*-cases}.ts',
        'packages/{jsonapi-core,hono-jsonapi,keyset-core,kysely-keyset}/src/**/index.ts',
        'packages/hono-ban/src/**/index.ts',
        'packages/hono-ban/src/formats/*.ts',
        'packages/hono-ban/src/{openapi,otel,postgresql,standard-schema,testing,valibot,zod}.ts',
      ],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});

export default config;
