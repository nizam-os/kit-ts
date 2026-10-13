/**
 * `localizeErrors(messages, { resource })` (SPEC 10.4): a `transform` for
 * `@nizam-os/ban-core`'s handler that rewrites the `title` and `detail` of
 * each object of a JSON:API error document with the application's
 * messages. Which message, and which inputs, is decided here, from the
 * object's code, the item it renders, and the resources; the language is
 * the message functions' own, so with Paraglide it is the locale
 * `paraglideMiddleware` resolved for the request.
 *
 * Objects pair with the error's items by index only when there are as many
 * of each: the handler renders one object per item, but re-renders an
 * oversized body as one object while passing the same error, items and
 * all (ban SPEC 6.8), and that object describes the error, not its first
 * item.
 * @ref https://jsonapi.org/format/1.1/#error-objects
 * @ref https://paraglidejs.com/server-side-rendering
 * @packageDocumentation
 */
import type { BanError, ErrorItem, HandlerOptions } from '@nizam-os/ban-core';

import type { Dictionary } from './dictionary';
import type { Messages } from './types';

import { isRecord } from '../internal/object';
import { checkedMessages } from './define-messages';
import { dictionaryOf } from './dictionary';
import { detailOf } from './object-detail';

const CALLER = 'localizeErrors';

/**
 * The top-level members an error document may have besides extension
 * members, whose names hold a `:`.
 * @ref https://jsonapi.org/format/1.1/#document-top-level
 * @ref https://jsonapi.org/format/1.1/#extension-rules
 */
const DOCUMENT_MEMBERS: ReadonlySet<string> = new Set([
  'errors',
  'jsonapi',
  'links',
  'meta',
]);

/** What `localizeErrors` takes besides the messages. */
export interface LocalizeErrorsOptions<TContext> {
  /** The type of the resource the request addresses, whose labels name the members its items point at. */
  readonly resource?: ((ctx: TContext) => string | undefined) | undefined;
}

/** The transform `localizeErrors` returns. */
export type ErrorTransform<TContext> = NonNullable<
  HandlerOptions<TContext>['transform']
>;

interface ErrorDocument {
  readonly errors: ReadonlyArray<unknown>;
}

function isErrorDocument(body: unknown): body is ErrorDocument {
  return (
    isRecord(body) &&
    Array.isArray(body['errors']) &&
    Object.keys(body).every(
      (name) => DOCUMENT_MEMBERS.has(name) || name.includes(':'),
    )
  );
}

function localizeObject(
  dictionary: Dictionary,
  object: unknown,
  item: ErrorItem | undefined,
  type: string | undefined,
): unknown {
  if (!isRecord(object) || typeof object['code'] !== 'string') {
    return object;
  }
  const rendered = object['code'];
  const code = dictionary.index.keys.get(rendered) ?? rendered;
  const derived = dictionary.index.derived.get(code);
  const text =
    dictionary.errors.get(code) ??
    (derived === undefined
      ? undefined
      : dictionary.messages.constraints[derived.kind]);
  if (text === undefined) {
    return object;
  }
  return {
    ...object,
    title: text.title(),
    detail: detailOf(dictionary, { code, text, derived, item, type }),
  };
}

/**
 * The `transform` that localizes JSON:API error documents with `messages`,
 * which `defineMessages` or `defaultMessages` returned. A body of another
 * shape, and an object whose code has no texts, pass through unchanged;
 * `status`, `code`, `source`, `id`, `links`, and `meta` never change.
 * Throws `TypeError` for messages no definer returned and for a
 * `resource` that is not a function.
 */
export function localizeErrors<TContext = unknown>(
  messages: Messages,
  options: LocalizeErrorsOptions<TContext> = {},
  // NoInfer: inside `ban.handler({ transform: localizeErrors(...) })` the
  // handler's own context is not inferred yet, and TypeScript would read it
  // as `never` here; the context comes from `resource`, or is `unknown`,
  // which every handler's context is assignable to.
): ErrorTransform<NoInfer<TContext>> {
  const checked = checkedMessages(messages);
  if (checked === undefined) {
    throw new TypeError(
      `${CALLER}: messages must be what defineMessages or defaultMessages returned`,
    );
  }
  const { resource } = options;
  if (resource !== undefined && typeof resource !== 'function') {
    throw new TypeError(`${CALLER}: resource must be a function`);
  }
  const dictionary = dictionaryOf(checked);
  return (body: unknown, error: BanError, ctx: TContext): unknown => {
    if (!isErrorDocument(body)) {
      return body;
    }
    const type = resource?.(ctx);
    const items = error.errors ?? [];
    const paired = items.length === body.errors.length;
    return {
      ...body,
      errors: body.errors.map((object, index) =>
        localizeObject(
          dictionary,
          object,
          paired ? items[index] : undefined,
          type,
        ),
      ),
    };
  };
}
