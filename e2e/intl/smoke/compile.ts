/**
 * Compiles the fixture catalogs with the built binding into `.tmp/smoke/`,
 * which the smoke checks import as `#compiled-messages` (SPEC 7.3). It runs on
 * the runtime under test, Bun or Deno, and on Node ahead of workerd, which
 * runs compiled messages but does not compile them: a Workers project
 * compiles in its build. The package's `build` runs it on Node too, so the
 * import resolves for knip after `pnpm run build`, as `e2e/resource`'s build
 * compiles its project. It refuses Deno before 2.6.10 (`runtime.ts`).
 */
import { fileURLToPath } from 'node:url';

import { compile } from '@nizam-os/paraglide-intl';

import { CATALOGS } from '../support/catalogs.ts';
import { writeProject } from '../support/project.ts';
import { requireDenoFloor, runtime } from './runtime.ts';

const OUTDIR = fileURLToPath(new URL('../.tmp/smoke', import.meta.url));

requireDenoFloor('compile');
const { project } = await writeProject(CATALOGS);
const { warnings } = await compile({ project, outdir: OUTDIR });
if (warnings.length > 0) {
  throw new Error(
    `the smoke compile warned: ${warnings.map((warning) => warning.message).join('; ')}`,
  );
}
console.log(`@nizam-os/intl smoke: compiled the fixture on ${runtime()}`);
