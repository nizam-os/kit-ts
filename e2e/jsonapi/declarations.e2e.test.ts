/**
 * Declarations a consumer emits for modules that export definitions:
 * `tsc --declaration`, run as a consumer runs it against the built
 * packages, over the blog's definitions and `declarations/definitions.ts`
 * reports nothing, and every type the emitted declarations name is
 * imported from a package entry point, so a package of shared definitions
 * can be published for a client to import.
 * @ref https://www.typescriptlang.org/tsconfig/#declaration
 */
import type { Run } from './support/run-bin';

import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PACKAGE_DIR, binPath, runBin } from './support/run-bin';

let outDir: string;
let run: Run;

beforeAll(async () => {
  await mkdir(join(PACKAGE_DIR, '.tmp'), { recursive: true });
  outDir = await mkdtemp(join(PACKAGE_DIR, '.tmp', 'declarations-'));
  const tsc = await binPath('typescript', 'tsc');
  run = await runBin(
    tsc,
    [
      '-p',
      'declarations/tsconfig.json',
      '--pretty',
      'false',
      '--outDir',
      outDir,
    ],
    PACKAGE_DIR,
  );
});

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('declarations of exported definitions', () => {
  it('compile with no diagnostics', () => {
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
  });

  it.each(['declarations/definitions.d.ts', 'support/resources.d.ts'])(
    '%s names types only through package entry points',
    async (file) => {
      const emitted = await readFile(join(outDir, file), 'utf8');
      expect(emitted).toContain('import("@nizam-os/jsonapi-core"');
      expect(emitted).not.toMatch(/node_modules|\/dist\//u);
    },
  );
});
