import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

/**
 * Library build. ESM only, runtime neutral, declarations via oxc
 * (isolatedDeclarations). Every subpath of `@nizam-os/ban-core` has a twin here that
 * re-exports it, so a Hono application imports one package. `@nizam-os/ban-core` is a
 * dependency, never bundled. `exports` keeps package.json in sync with the
 * entry map below; publint and attw run as part of the build.
 * @ref https://tsdown.dev/options/config-file
 * @ref https://tsdown.dev/options/package-exports
 */
const config: UserConfig = defineConfig({
  entry: {
    index: 'src/index.ts',
    'formats/problem-details': 'src/formats/problem-details.ts',
    'formats/json-api': 'src/formats/json-api.ts',
    'formats/plain': 'src/formats/plain.ts',
    'formats/google-api': 'src/formats/google-api.ts',
    'formats/stripe': 'src/formats/stripe.ts',
    zod: 'src/zod.ts',
    valibot: 'src/valibot.ts',
    'standard-schema': 'src/standard-schema.ts',
    openapi: 'src/openapi.ts',
    otel: 'src/otel.ts',
    postgresql: 'src/postgresql.ts',
    testing: 'src/testing.ts',
  },
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  clean: true,
  exports: { devExports: 'source' },
  publint: true,
  attw: true,
});

export default config;
