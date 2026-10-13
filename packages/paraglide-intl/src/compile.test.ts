import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { compile as paraglideCompile } from '@inlang/paraglide-js';
import { describe, expect, it } from 'vitest';

import { isolate } from '@nizam-os/intl-core';

import { compile } from './compile';
import {
  compiledMessage,
  filesUnder,
  fixtureProject,
  MESSAGES,
} from './test-support/fixture-project';

const NAME = 'محمد';
const BACKSLASH = String.fromCodePoint(0x5c);

describe('compile (SPEC 6.1, 6.2)', () => {
  it('isolates every interpolated value in every locale by default', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    const result = await compile({ project, outdir });
    expect(result.warnings).toEqual([]);
    const sharedBy = await compiledMessage(outdir, 'shared_by');
    expect(sharedBy({ name: NAME, count: 2 }, { locale: 'en' })).toBe(
      `Shared by ${isolate(NAME)} (${isolate('2')})`,
    );
    expect(sharedBy({ name: 'Ali', count: 2 }, { locale: 'ar' })).toBe(
      `شاركه ${isolate('Ali')} (${isolate('2')})`,
    );
    const welcome = await compiledMessage(outdir, 'welcome');
    expect(welcome({ name: NAME }, { locale: 'en' })).toBe(
      `Hi ${isolate(NAME)}`,
    );
    const onlyName = await compiledMessage(outdir, 'only_name');
    expect(onlyName({ name: NAME }, { locale: 'en' })).toBe(NAME);
  });

  it('selects a plural on the raw count and isolates the count it prints', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    await compile({ project, outdir });
    const items = await compiledMessage(outdir, 'items');
    expect([1, 2].map((count) => items({ count }, { locale: 'en' }))).toEqual([
      `${isolate('1')} item`,
      `${isolate('2')} items`,
    ]);
    expect(
      [1, 3, 11, 100].map((count) => items({ count }, { locale: 'ar' })),
    ).toEqual([
      'عنصر واحد',
      `${isolate('3')} عناصر`,
      `${isolate('11')} عنصرًا`,
      `${isolate('100')} عنصر`,
    ]);
  });

  it('isolates the listed locales only', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    await compile({ project, outdir, isolate: ['ar'] });
    const sharedBy = await compiledMessage(outdir, 'shared_by');
    expect(sharedBy({ name: NAME, count: 2 }, { locale: 'en' })).toBe(
      `Shared by ${NAME} (2)`,
    );
    expect(sharedBy({ name: 'Ali', count: 2 }, { locale: 'ar' })).toBe(
      `شاركه ${isolate('Ali')} (${isolate('2')})`,
    );
  });

  it('leaves the catalogs on disk byte for byte as they were', async () => {
    const fixture = await fixtureProject(MESSAGES);
    const settings = join(fixture.project, 'settings.json');
    const before = await filesUnder(join(fixture.dir, 'messages'));
    const settingsBefore = await readFile(settings, 'utf8');
    await compile({ project: fixture.project, outdir: fixture.outdir });
    expect(await filesUnder(join(fixture.dir, 'messages'))).toEqual(before);
    expect(await readFile(settings, 'utf8')).toBe(settingsBefore);
  });

  it("writes Paraglide's own output when nothing is isolated", async () => {
    const fixture = await fixtureProject(MESSAGES);
    const theirs = join(fixture.dir, 'paraglide-js');
    await paraglideCompile({ project: fixture.project, outdir: theirs });
    await compile({
      project: fixture.project,
      outdir: fixture.outdir,
      isolate: false,
    });
    expect(await filesUnder(fixture.outdir)).toEqual(await filesUnder(theirs));
  });

  it('writes each bidi control of the compiled code as an escape', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    await compile({ project, outdir });
    const code = await readFile(
      join(outdir, 'messages', 'shared_by.js'),
      'utf8',
    );
    expect(code).not.toMatch(/\p{Bidi_Control}/u);
    expect(code).toContain(
      `Shared by ${BACKSLASH}u2068\${i?.name}${BACKSLASH}u2069`,
    );
  });

  it('refuses a locale the project does not declare before writing', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    await expect(compile({ project, outdir, isolate: ['fr'] })).rejects.toThrow(
      new TypeError(
        'compile: isolate lists fr, a locale the project does not declare',
      ),
    );
    await expect(stat(outdir)).rejects.toThrow(/ENOENT/u);
  });
});
