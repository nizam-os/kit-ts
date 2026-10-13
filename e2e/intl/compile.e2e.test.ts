/**
 * The binding through its built package (SPEC 6, 7.2): a Paraglide project
 * in a new directory, compiled by `compile()` with the Paraglide installed
 * beside it, its messages called in English and Arabic, and a project whose
 * messages format refused before anything is written.
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compile,
  isolate,
  MessageFormattingError,
} from '@nizam-os/paraglide-intl';

import { importMessages, message, writeProject } from './support/project';

const CATALOGS = {
  en: { shared_by: 'Shared by {name} ({count})', only_name: '{name}' },
  ar: { shared_by: 'شاركه {name} ({count})', only_name: '{name}' },
};

describe('compile through the built package', () => {
  it('compiles messages whose values are isolated in every locale', async () => {
    const { dir, project, outdir } = await writeProject(CATALOGS);
    const result = await compile({ project, outdir });
    expect(result.warnings).toEqual([]);
    const m = await importMessages(outdir);
    const sharedBy = message(m, 'shared_by');
    expect(sharedBy({ name: 'محمد', count: 2 }, { locale: 'en' })).toBe(
      `Shared by ${isolate('محمد')} (${isolate('2')})`,
    );
    expect(sharedBy({ name: 'Ali', count: 2 }, { locale: 'ar' })).toBe(
      `شاركه ${isolate('Ali')} (${isolate('2')})`,
    );
    expect(message(m, 'only_name')({ name: 'Ali' }, { locale: 'ar' })).toBe(
      'Ali',
    );
    const code = await readFile(
      join(outdir, 'messages', 'shared_by.js'),
      'utf8',
    );
    expect(code).not.toMatch(/\p{Bidi_Control}/u);
    expect(await readFile(join(dir, 'messages', 'ar.json'), 'utf8')).toBe(
      JSON.stringify(CATALOGS.ar),
    );
  });

  it('refuses a message that formats, naming it, before writing anything', async () => {
    const { project, outdir } = await writeProject({
      en: { total: 'Total: {amount: number}' },
      ar: { total: 'المجموع: {amount: number}' },
    });
    const error: unknown = await compile({ project, outdir }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(MessageFormattingError);
    expect(error).toMatchObject({
      findings: [
        {
          bundleId: 'total',
          locale: 'ar',
          variable: 'amount',
          annotation: 'number',
        },
        {
          bundleId: 'total',
          locale: 'en',
          variable: 'amount',
          annotation: 'number',
        },
      ],
    });
    await expect(stat(outdir)).rejects.toThrow(/ENOENT/u);
  });
});
