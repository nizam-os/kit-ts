import { describe, expect, it } from 'vitest';

import {
  FIRST_STRONG_ISOLATE,
  POP_DIRECTIONAL_ISOLATE,
} from '@nizam-os/intl-core';

import { isolateBundle, isolatePattern } from './isolate-patterns';
import { bundle, text, variable } from './test-support/bundles';

const OPEN = { type: 'text', value: FIRST_STRONG_ISOLATE };
const CLOSE = { type: 'text', value: POP_DIRECTIONAL_ISOLATE };

function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

describe('isolatePattern (SPEC 6.2)', () => {
  it('puts each expression between the isolates, as two text parts', () => {
    expect(
      isolatePattern([
        text('Shared by '),
        variable('name'),
        text(' ('),
        variable('count'),
        text(')'),
      ]),
    ).toEqual([
      text('Shared by '),
      OPEN,
      variable('name'),
      CLOSE,
      text(' ('),
      OPEN,
      variable('count'),
      CLOSE,
      text(')'),
    ]);
  });

  it('isolates a literal expression and keeps markup in place', () => {
    const literal = {
      type: 'expression',
      arg: { type: 'literal', value: 'x' },
    };
    const start = { type: 'markup-start', name: 'b' };
    const end = { type: 'markup-end', name: 'b' };
    expect(isolatePattern([start, literal, end])).toEqual([
      start,
      OPEN,
      literal,
      CLOSE,
      end,
    ]);
  });

  it('returns the pattern itself for one part, or without expressions', () => {
    const alone = [variable('name')];
    const plain = [text('Hello'), { type: 'markup-standalone', name: 'icon' }];
    expect(isolatePattern(alone)).toBe(alone);
    expect(isolatePattern(plain)).toBe(plain);
    expect(isolatePattern([])).toEqual([]);
  });
});

describe('isolateBundle (SPEC 6.2)', () => {
  it('rewrites the messages of the isolated locales only, keeping every other field', () => {
    const input = deepFreeze(bundle(['en', 'ar']));
    const output = isolateBundle(input, new Set(['ar']));
    const [en, ar] = output?.messages ?? [];
    expect(en).toBe(input.messages[0]);
    expect(ar).toEqual({
      ...input.messages[1],
      variants: [
        {
          ...input.messages[1]?.variants[0],
          pattern: [text('Shared by '), OPEN, variable('name'), CLOSE],
        },
      ],
    });
    expect({ ...output, messages: [] }).toEqual({ ...input, messages: [] });
  });

  it('returns undefined when no pattern of an isolated locale changes', () => {
    expect(isolateBundle(bundle(['en']), new Set(['ar']))).toBeUndefined();
    const bare = bundle(['en'], [variable('name')]);
    expect(isolateBundle(bare, new Set(['en']))).toBeUndefined();
  });
});
