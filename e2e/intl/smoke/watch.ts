/**
 * Watches the fixture catalogs with the built binding (SPEC 7.3): compiles
 * them into a new directory, edits a catalog, waits for the compile the edit
 * starts, checks that it wrote the edit, and closes. The process must then
 * exit on its own: a watcher, a timer, or a worker of the SDK left open keeps
 * it running. It refuses Deno before 2.6.10 (`runtime.ts`).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { watch } from '@nizam-os/paraglide-intl';

import { CATALOGS } from '../support/catalogs.ts';
import { writeProject } from '../support/project.ts';
import { requireDenoFloor, runtime } from './runtime.ts';

const TIMEOUT_MS = 20_000;
const EDITED = 'Sent by {name}';

requireDenoFloor('watch');
const { dir, project, outdir } = await writeProject(CATALOGS);
const errors: Array<unknown> = [];
let settled: (() => void) | undefined;
const watcher = await watch({
  project,
  outdir,
  onCompile: () => {
    settled?.();
  },
  onError: (error) => {
    errors.push(error);
    settled?.();
  },
});
const compiledEdit = new Promise<void>((resolve) => {
  settled = resolve;
});
await writeFile(
  join(dir, 'messages', 'en.json'),
  JSON.stringify({ ...CATALOGS['en'], shared_by: EDITED }),
);
const timer = setTimeout(() => {
  settled?.();
}, TIMEOUT_MS);
await compiledEdit;
clearTimeout(timer);
await watcher.close();
if (errors.length > 0) {
  throw new Error('the smoke watch failed to compile', { cause: errors[0] });
}
const code = await readFile(join(outdir, 'messages', 'shared_by.js'), 'utf8');
if (!code.includes('Sent by')) {
  throw new Error(
    `the smoke watch did not compile the edit within ${TIMEOUT_MS} ms`,
  );
}
console.log(
  `@nizam-os/intl smoke: watch compiled an edit and closed on ${runtime()}`,
);
