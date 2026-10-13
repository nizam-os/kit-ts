import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { compile as paraglideCompile } from '@inlang/paraglide-js';
import { describe, expect, it } from 'vitest';

import { isolate } from '@nizam-os/intl-core';

import { compile } from './compile';
import { MessageFormattingError } from './formatting-annotations';
import {
  compiledMessage,
  filesUnder,
  fixtureProject,
} from './test-support/fixture-project';

/** A plural whose forms print `shown`, a local that formats the count. */
function formattedCount(
  forms: Readonly<Record<string, string>>,
): ReadonlyArray<Record<string, unknown>> {
  return [
    {
      declarations: [
        'input count',
        'local countPlural = count: plural',
        'local shown = count: number',
      ],
      selectors: ['countPlural'],
      match: Object.fromEntries(
        Object.entries(forms).map(([form, text]) => [
          `countPlural=${form}`,
          text,
        ]),
      ),
    },
  ];
}

/** Messages that format inline and in a declaration, beside one that does not. */
const FORMATS = {
  en: {
    total: 'Total: {amount: number}',
    sent: 'Sent {when: datetime}',
    items: formattedCount({ one: '{shown} item', other: '{shown} items' }),
    greeting: 'Hello {name}',
  },
  ar: {
    total: 'المجموع: {amount: number}',
    sent: 'أُرسل {when: datetime}',
    items: formattedCount({
      one: 'عنصر واحد',
      few: '{shown} عناصر',
      many: '{shown} عنصرًا',
      other: '{shown} عنصر',
    }),
    greeting: 'مرحبا {name}',
  },
};

const FINDINGS = [
  {
    bundleId: 'items',
    locale: undefined,
    variable: 'shown',
    annotation: 'number',
  },
  { bundleId: 'sent', locale: 'ar', variable: 'when', annotation: 'datetime' },
  { bundleId: 'sent', locale: 'en', variable: 'when', annotation: 'datetime' },
  { bundleId: 'total', locale: 'ar', variable: 'amount', annotation: 'number' },
  { bundleId: 'total', locale: 'en', variable: 'amount', annotation: 'number' },
];

describe('compile refuses a message that formats (SPEC 6.1, 6.3)', () => {
  it('lists every finding before writing anything, the catalogs unchanged', async () => {
    const { dir, project, outdir } = await fixtureProject(FORMATS);
    const catalogs = await filesUnder(join(dir, 'messages'));
    const error: unknown = await compile({ project, outdir }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(MessageFormattingError);
    expect(error).toMatchObject({ findings: FINDINGS });
    await expect(stat(outdir)).rejects.toThrow(/ENOENT/u);
    expect(await filesUnder(join(dir, 'messages'))).toEqual(catalogs);
  });

  it('refuses with the isolates turned off as well', async () => {
    const { project, outdir } = await fixtureProject(FORMATS);
    await expect(compile({ project, outdir, isolate: false })).rejects.toThrow(
      MessageFormattingError,
    );
  });

  it("compiles them with formatters: 'allow' as Paraglide does, each value isolated", async () => {
    const fixture = await fixtureProject(FORMATS);
    const theirs = join(fixture.dir, 'paraglide-js');
    await paraglideCompile({ project: fixture.project, outdir: theirs });
    await compile({
      project: fixture.project,
      outdir: fixture.outdir,
      formatters: 'allow',
    });
    // Paraglide 2.11 formats a declaration but not an annotated expression;
    // 2.20 and later format both (SPEC 6.3).
    const paraglideTotal = await compiledMessage(theirs, 'total');
    const rendered = paraglideTotal({ amount: 1234.5 }, { locale: 'en' });
    const total = await compiledMessage(fixture.outdir, 'total');
    expect(total({ amount: 1234.5 }, { locale: 'en' })).toBe(
      `Total: ${isolate(rendered.slice('Total: '.length))}`,
    );
    const items = await compiledMessage(fixture.outdir, 'items');
    expect(items({ count: 1200 }, { locale: 'en' })).toBe(
      `${isolate('1,200')} items`,
    );
  });
});
