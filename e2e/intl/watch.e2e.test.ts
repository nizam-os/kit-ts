/**
 * Watch mode through the built package (SPEC 6.5, 7.2): a project compiled
 * by `watch()`, an edit to a catalog compiled again into the output a fresh
 * `compile()` of the edited project writes, and nothing compiled once the
 * watch is closed.
 */
import type { CompileResult } from '@nizam-os/paraglide-intl';

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { compile, watch } from '@nizam-os/paraglide-intl';

import { CATALOGS } from './support/catalogs';
import { writeProject } from './support/project';

/** Longer than a change takes to be reported and compiled. */
const QUIET_MS = 1000;
const UNTIL = { timeout: 15_000 } as const;

/** Every file under `dir`, by path relative to it. */
async function filesUnder(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[path.slice(dir.length + 1)] = await readFile(path, 'utf8');
    }
  }
  return files;
}

describe('watch through the built package', () => {
  it('compiles each edit until it is closed', async () => {
    const { dir, project, outdir } = await writeProject(CATALOGS);
    const en = join(dir, 'messages', 'en.json');
    const results: Array<CompileResult> = [];
    const watcher = await watch({
      project,
      outdir,
      onCompile: (result) => {
        results.push(result);
      },
    });
    try {
      const before = results.length;
      expect(before).toBeGreaterThan(0);
      await writeFile(
        en,
        JSON.stringify({ ...CATALOGS['en'], shared_by: 'Sent by {name}' }),
      );
      await vi.waitFor(() => {
        expect(results.length).toBeGreaterThan(before);
      }, UNTIL);
      const fresh = join(dir, 'fresh');
      await compile({ project, outdir: fresh });
      expect(await filesUnder(outdir)).toEqual(await filesUnder(fresh));
    } finally {
      await watcher.close();
    }
    const closed = results.length;
    await writeFile(en, JSON.stringify(CATALOGS['en']));
    await new Promise((resolve) => {
      setTimeout(resolve, QUIET_MS);
    });
    expect(results).toHaveLength(closed);
  });
});
