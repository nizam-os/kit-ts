/**
 * Declarations a consumer emits for modules that export declared
 * resources: `tsc --declaration`, run as a consumer runs it against the
 * built packages, over the contacts application's resources and a module
 * that exports a declared resource's JSON:API definition reports nothing,
 * and every type the emitted declarations name is imported from a package
 * entry point, so the definitions can be published for a client.
 * @ref https://www.typescriptlang.org/tsconfig/#declaration
 */
import type { Run } from './support/run-bin';

import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PACKAGE_DIR } from './support/paths';
import { binPath, runBin } from './support/run-bin';

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

describe('declarations of exported resources', () => {
  it('compile with no diagnostics', () => {
    expect(run.stdout).toBe('');
    expect(run.code).toBe(0);
  });

  it.each(['declarations/exports.d.ts', 'resources/contacts.d.ts'])(
    '%s names types only through package entry points',
    async (file) => {
      const emitted = await readFile(join(outDir, file), 'utf8');
      expect(emitted).toMatch(
        /import\("@nizam-os\/(?:resource|jsonapi)-core"/u,
      );
      expect(emitted).not.toMatch(/node_modules|\/dist\//u);
    },
  );
});
