import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_FILES, findConfigFile, loadConfigFile } from './config-file';
import { PgCatalogError } from './errors';

const VALID = `export default {
  migrations: 'migrations',
  out: { catalog: 'src/db/catalog.ts' },
};
`;

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pg-catalog-config-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function write(name: string, source: string): Promise<string> {
  const path = join(directory, name);
  await writeFile(path, source);
  return path;
}

/** The `PgCatalogError` that loading `name` with `source` fails with. */
async function loadFailure(
  name: string,
  source: string,
): Promise<PgCatalogError> {
  const error: unknown = await loadConfigFile(await write(name, source)).then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(PgCatalogError);
  return error as PgCatalogError;
}

describe('findConfigFile (SPEC 11.1)', () => {
  it('returns null in a directory without a configuration file', async () => {
    await write('vite.config.ts', 'export default {};');
    expect(await findConfigFile(directory)).toBeNull();
  });

  it('prefers .ts, then .mts, then .js, then .mjs', async () => {
    for (const name of CONFIG_FILES.toReversed()) {
      await write(name, VALID);
      expect(await findConfigFile(directory)).toBe(join(directory, name));
    }
    expect(CONFIG_FILES).toEqual([
      'pg-catalog.config.ts',
      'pg-catalog.config.mts',
      'pg-catalog.config.js',
      'pg-catalog.config.mjs',
    ]);
  });
});

describe('loadConfigFile (SPEC 11.1)', () => {
  it('returns the validated default export', async () => {
    const path = await write('pg-catalog.config.mjs', VALID);
    expect(await loadConfigFile(path)).toEqual({
      migrations: 'migrations',
      out: { catalog: 'src/db/catalog.ts' },
    });
  });

  it('reports a file that does not exist with its full path', async () => {
    const path = join(directory, 'missing.config.mjs');
    await expect(loadConfigFile(path)).rejects.toThrow(
      new PgCatalogError('config_invalid', `${path} does not exist`),
    );
  });

  it('reports a configuration that fails validation as config_invalid, naming the file and the option', async () => {
    const error = await loadFailure(
      'pg-catalog.config.mjs',
      `export default { migrations: 'migrations', out: { catalog: 'c.ts', type: 'db.ts' } };`,
    );
    expect(error.code).toBe('config_invalid');
    expect(error.message).toBe(
      'pg-catalog.config.mjs: defineExtraction: out.type is not an option',
    );
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('reports a module without a default export', async () => {
    const error = await loadFailure(
      'pg-catalog.config.mjs',
      `export const config = { migrations: 'migrations' };`,
    );
    expect(error.code).toBe('config_invalid');
    expect(error.message).toBe(
      'pg-catalog.config.mjs has no default export; export default defineExtraction({ ... })',
    );
  });

  it('reports a module that cannot be imported, with the reason', async () => {
    const error = await loadFailure(
      'pg-catalog.config.js',
      `throw new Error('DATABASE_URL is required');`,
    );
    expect(error.code).toBe('config_invalid');
    expect(error.message).toBe(
      'cannot load pg-catalog.config.js: DATABASE_URL is required',
    );
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('reports a syntax error as config_invalid', async () => {
    const error = await loadFailure(
      'pg-catalog.config.mjs',
      'export default { migrations: ',
    );
    expect(error.code).toBe('config_invalid');
    expect(error.message).toMatch(/^cannot load pg-catalog\.config\.mjs: /u);
  });
});
