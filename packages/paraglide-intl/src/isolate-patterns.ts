/**
 * The pattern rewrite (SPEC 6.2, ADR 0006, ADR 0007): in the messages of
 * the isolated locales, every expression of a pattern of two or more parts
 * goes between U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL
 * ISOLATE, as two text parts around it. A pattern of one part is left as
 * it is, as Fluent leaves a placeable that is the whole message. Bundles
 * are read as the inlang SDK returns them, and every field the rewrite
 * does not change is kept, so the SDK writes them back as they were.
 * @ref https://www.unicode.org/reports/tr9/#Explicit_Directional_Isolates
 * @ref https://github.com/opral/inlang/blob/main/packages/sdk/src/json-schema/pattern.ts (Pattern: text, expression, and markup parts)
 * @packageDocumentation
 */
import type { Bundle, PatternPart } from './bundle';

import {
  FIRST_STRONG_ISOLATE,
  POP_DIRECTIONAL_ISOLATE,
} from '@nizam-os/intl-core';

function text(value: string): PatternPart & { readonly value: string } {
  return { type: 'text', value };
}

/** `pattern` with each expression isolated; the same array when nothing changes. */
export function isolatePattern(
  pattern: ReadonlyArray<PatternPart>,
): ReadonlyArray<PatternPart> {
  if (
    pattern.length < 2 ||
    !pattern.some((part) => part.type === 'expression')
  ) {
    return pattern;
  }
  return pattern.flatMap((part) =>
    part.type === 'expression'
      ? [text(FIRST_STRONG_ISOLATE), part, text(POP_DIRECTIONAL_ISOLATE)]
      : [part],
  );
}

type Message = Bundle['messages'][number];

function isolateMessage(message: Message): Message {
  const variants = message.variants.map((variant) => {
    const pattern = isolatePattern(variant.pattern);
    return pattern === variant.pattern ? variant : { ...variant, pattern };
  });
  return variants.every((variant, index) => variant === message.variants[index])
    ? message
    : { ...message, variants };
}

/** `bundle` with the messages of `locales` isolated, or `undefined` when no pattern changes. */
export function isolateBundle(
  bundle: Bundle,
  locales: ReadonlySet<string>,
): Bundle | undefined {
  const messages = bundle.messages.map((message) =>
    locales.has(message.locale) ? isolateMessage(message) : message,
  );
  return messages.every((message, index) => message === bundle.messages[index])
    ? undefined
    : { ...bundle, messages };
}
