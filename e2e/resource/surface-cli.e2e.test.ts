/**
 * `pg-catalog surface` and `surface --check` (catalog SPEC 10.4, 11.2) run
 * as a package manager runs the built bin, over the contacts application's
 * declarations, each configuration importing its registry lazily: the
 * snapshot `surface` writes is the reviewed `snapshots/surface.json` byte
 * for byte, and after the edits of `support/surface-edits.ts` the check
 * prints exactly the changes `openapi-surface.e2e.test.ts` pins, the
 * breaking ones first, and exits 1.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { CONTACTS_DIR, PACKAGE_DIR } from './support/paths';
import { binPath, runBin } from './support/run-bin';

let project: string;
let bin: string;

/** A configuration whose registry is `name` of `module`, its surface in `surface`. */
function configFile(module: string, name: string, surface: string): string {
  const url = new URL(module, `file://${PACKAGE_DIR}`).href;
  return `export default {
  migrations: ${JSON.stringify(join(CONTACTS_DIR, 'migrations'))},
  out: { catalog: 'catalog.ts' },
  resources: {
    registry: async () => (await import(${JSON.stringify(url)})).${name},
    surface: ${JSON.stringify(surface)},
  },
};
`;
}

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), 'resource-e2e-surface-'));
  bin = await binPath('@nizam-os/pg-catalog', 'pg-catalog');
  const files: Readonly<Record<string, string>> = {
    'app.config.mjs': configFile(
      'runtime/api.ts',
      'APP_RESOURCES',
      'surface.json',
    ),
    'before.config.mjs': configFile(
      'support/surface-edits.ts',
      'BEFORE',
      'contacts.json',
    ),
    'after.config.mjs': configFile(
      'support/surface-edits.ts',
      'AFTER',
      'contacts.json',
    ),
  };
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(project, name), text);
  }
});

describe('pg-catalog surface', () => {
  it('writes the reviewed snapshot of the application, then finds it current', async () => {
    expect(
      await runBin(bin, ['surface', '--config', 'app.config.mjs'], project),
    ).toEqual({
      code: 0,
      stdout: 'written   surface.json\n',
      stderr: '',
    });
    expect(await readFile(join(project, 'surface.json'), 'utf8')).toBe(
      await readFile(join(PACKAGE_DIR, 'snapshots', 'surface.json'), 'utf8'),
    );
    expect(
      await runBin(
        bin,
        ['surface', '--check', '--config', 'app.config.mjs'],
        project,
      ),
    ).toEqual({ code: 0, stdout: 'surface.json: no changes\n', stderr: '' });
  });

  it('prints the changes of the edited contacts declaration and exits 1 on the breaking ones', async () => {
    expect(
      (await runBin(bin, ['surface', '--config', 'before.config.mjs'], project))
        .code,
    ).toBe(0);
    expect(
      await runBin(
        bin,
        ['surface', '--check', '--config', 'after.config.mjs'],
        project,
      ),
    ).toEqual({
      code: 1,
      stdout: [
        'contacts.json: 4 changes, 3 breaking',
        '',
        'Breaking',
        '  - contacts.operations.remove',
        '  ~ contacts.fields.nickname.access: "readWrite" -> "read"',
        '  ~ contacts.fields.priority.sortable: true -> false',
        '',
        'Safe',
        '  + contacts.fields.email.operators.in',
        '',
        'Run pg-catalog surface to record them.',
        '',
      ].join('\n'),
      stderr: '',
    });
  });
});
