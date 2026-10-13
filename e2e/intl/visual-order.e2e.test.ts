/**
 * Visual order (SPEC 7.2, ADR 0006). Each sentence is laid out by a
 * conforming implementation of the Unicode Bidirectional Algorithm, once
 * with the values isolated by the built core and once as plain
 * interpolation, and compared with the layout UAX #9 prescribes for an
 * isolate: a neutral outside, a paragraph of its own inside. The same
 * sentences then go through a compile as messages: the built binding writes
 * them as the core does, and Paraglide's own interpolation reorders them.
 */
import type { Catalogs } from './support/catalogs';
import type { Direction, Sentence } from './support/layout';
import type { Messages } from './support/project';

import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { isolate } from '@nizam-os/intl-core';
import { compile } from '@nizam-os/paraglide-intl';

import { isolatedLayout, layout, write } from './support/layout';
import { importMessages, message, writeProject } from './support/project';

interface Case {
  readonly name: string;
  readonly direction: Direction;
  readonly sentence: Sentence;
}

/** ADR 0006: sentences whose plain interpolation the algorithm reorders. */
const REORDERED: ReadonlyArray<Case> = [
  {
    name: 'a count after a right-to-left name',
    direction: 'ltr',
    sentence: ['Shared by ', { value: 'محمد' }, ' (', { value: '2' }, ')'],
  },
  {
    name: 'punctuation and digits after a right-to-left name',
    direction: 'ltr',
    sentence: ['Assigned to ', { value: 'محمد' }, ': 5 tasks'],
  },
  {
    name: 'digits after a left-to-right name in right-to-left text',
    direction: 'rtl',
    sentence: ['أرسل ', { value: 'Casey' }, ' 5 رسائل'],
  },
];

/** Sentences the algorithm already lays out in order: isolation keeps them so. */
const IN_ORDER: ReadonlyArray<Case> = [
  {
    name: 'a left-to-right name with brackets in right-to-left text',
    direction: 'rtl',
    sentence: [
      'دعا ',
      { value: 'Casey (Ops)' },
      ' إلى ',
      { value: '3' },
      ' فرق',
    ],
  },
  {
    name: 'a version number in right-to-left text',
    direction: 'rtl',
    sentence: ['الملف ', { value: 'v2' }, ' جاهز'],
  },
  {
    name: 'an empty value',
    direction: 'ltr',
    sentence: ['Shared by ', { value: '' }, ' (2)'],
  },
];

/** Values that carry an unmatched isolate control of their own (ADR 0006). */
const UNBALANCED: ReadonlyArray<Case> = [
  {
    name: 'an unmatched U+2069 followed by an override',
    direction: 'ltr',
    sentence: ['Shared by ', { value: 'a\u2069\u202Exyz' }, ' (2) files'],
  },
  {
    name: 'an unmatched U+2066',
    direction: 'ltr',
    sentence: ['Shared by ', { value: 'محمد\u2066' }, ' (2) files'],
  },
];

const BIDI_CONTROLS = /\p{Bidi_Control}/gu;

function withoutControls(sentence: Sentence): Sentence {
  return sentence.map((part) =>
    typeof part === 'string'
      ? part
      : { value: part.value.replace(BIDI_CONTROLS, '') },
  );
}

describe('isolate in a laid out sentence', () => {
  it.each([...REORDERED, ...IN_ORDER])(
    'keeps $name in place',
    ({ direction, sentence }) => {
      expect(layout(write(sentence, isolate), direction)).toBe(
        isolatedLayout(sentence, direction),
      );
    },
  );

  it.each(REORDERED)(
    'the plain interpolation of $name is reordered',
    ({ direction, sentence }) => {
      expect(layout(write(sentence, String), direction)).not.toBe(
        isolatedLayout(sentence, direction),
      );
    },
  );

  it.each(UNBALANCED)(
    'a value with $name escapes, and stays in place once its controls are removed',
    ({ direction, sentence }) => {
      expect(layout(write(sentence, isolate), direction)).not.toBe(
        isolatedLayout(sentence, direction),
      );
      const cleaned = withoutControls(sentence);
      expect(layout(write(cleaned, isolate), direction)).toBe(
        isolatedLayout(cleaned, direction),
      );
    },
  );
});

const LOCALE: Readonly<Record<Direction, string>> = { ltr: 'en', rtl: 'ar' };

function values(sentence: Sentence): ReadonlyArray<string> {
  return sentence.flatMap((part) =>
    typeof part === 'string' ? [] : [part.value],
  );
}

/** The sentence as a message's text, its values as the inputs `v0`, `v1`, ... */
function pattern(sentence: Sentence): string {
  let next = 0;
  return write(sentence, () => {
    next += 1;
    return `{v${next - 1}}`;
  });
}

function inputs(sentence: Sentence): Readonly<Record<string, string>> {
  return Object.fromEntries(
    values(sentence).map((value, index) => [`v${index}`, value]),
  );
}

/** The cases, each with the key of its message. */
const MESSAGES = [...REORDERED, ...IN_ORDER].map(
  ({ name, direction, sentence }, index) => ({
    name,
    direction,
    sentence,
    key: `case_${index}`,
  }),
);

/** One message per case, the same text in both locales. */
function catalogs(): Catalogs {
  const messages = Object.fromEntries(
    MESSAGES.map(({ key, sentence }) => [key, pattern(sentence)]),
  );
  return { en: messages, ar: messages };
}

describe('compiled messages in a laid out sentence', () => {
  let isolated: Messages = {};
  let plain: Messages = {};

  beforeAll(async () => {
    const { dir, project, outdir } = await writeProject(catalogs());
    await compile({ project, outdir });
    await compile({ project, outdir: join(dir, 'plain'), isolate: false });
    isolated = await importMessages(outdir);
    plain = await importMessages(join(dir, 'plain'));
  });

  it.each(MESSAGES)(
    'keeps $name in place, written as the core writes it',
    ({ key, direction, sentence }) => {
      const text = message(isolated, key)(inputs(sentence), {
        locale: LOCALE[direction],
      });
      expect(text).toBe(write(sentence, isolate));
      expect(layout(text, direction)).toBe(isolatedLayout(sentence, direction));
    },
  );

  it.each(MESSAGES.slice(0, REORDERED.length))(
    "Paraglide's own interpolation of $name is reordered",
    ({ key, direction, sentence }) => {
      const text = message(plain, key)(inputs(sentence), {
        locale: LOCALE[direction],
      });
      expect(text).toBe(write(sentence, String));
      expect(layout(text, direction)).not.toBe(
        isolatedLayout(sentence, direction),
      );
    },
  );
});
