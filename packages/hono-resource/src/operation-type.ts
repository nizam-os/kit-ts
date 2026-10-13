/**
 * The type of the operation an operations request failed in (resource
 * SPEC 19.6), for `resourceTypeOf`. The index is the one the error's
 * items point under; the type is read from the request document as the
 * processor reads an operation's, its target's, else its data's (jsonapi
 * SPEC 11.4), since a document refusal inside an operation, such as a
 * validation issue, comes before any handler runs. The document is
 * request text, so a type the routes do not serve is none.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @packageDocumentation
 */
import type { Context, Env, Next } from 'hono';

import type { OperationTarget } from '@nizam-os/hono-jsonapi/atomic';

import { isBanError, readDocument } from '@nizam-os/hono-jsonapi';

import { noteType } from './resource-type';

const OPERATIONS = 'atomic:operations';
/** An index as a pointer spells it (RFC 6901 section 4). */
const INDEX = /^(?:0|[1-9]\d*)$/u;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/** The member `name` of `record`, when it is its own. */
function own(record: Readonly<Record<string, unknown>>, name: string): unknown {
  return Object.hasOwn(record, name) ? record[name] : undefined;
}

/** The index of the operation `error`'s items point under, when they do. */
function failedIndex(error: unknown): number | undefined {
  if (!isBanError(error)) {
    return undefined;
  }
  for (const item of error.errors ?? []) {
    const [member, index] = item.path ?? [];
    if (
      member === OPERATIONS &&
      (typeof index === 'number' ||
        (typeof index === 'string' && INDEX.test(index)))
    ) {
      return Number(index);
    }
  }
  return undefined;
}

/** The type operation `index` of `document` targets: its target's, else its data's. */
function typeAt(
  document: unknown,
  index: number,
  resolveHref: (href: string) => OperationTarget | undefined,
): unknown {
  const operations = isRecord(document) ? own(document, OPERATIONS) : undefined;
  const operation: unknown = Array.isArray(operations)
    ? operations[index]
    : undefined;
  if (!isRecord(operation)) {
    return undefined;
  }
  const ref = own(operation, 'ref');
  const href = own(operation, 'href');
  const data = own(operation, 'data');
  if (isRecord(ref)) {
    return own(ref, 'type');
  }
  if (typeof href === 'string') {
    return resolveHref(href)?.type;
  }
  return isRecord(data) ? own(data, 'type') : undefined;
}

/**
 * The type of the operation the request of `c` failed in with `error`,
 * when `served` holds it. The document is read again from the request,
 * whose body Hono keeps.
 */
async function failedType(
  c: Context,
  error: unknown,
  resolveHref: (href: string) => OperationTarget | undefined,
  served: ReadonlySet<string>,
): Promise<string | undefined> {
  const index = failedIndex(error);
  if (index === undefined) {
    return undefined;
  }
  const type = typeAt(await readDocument(c), index, resolveHref);
  return typeof type === 'string' && served.has(type) ? type : undefined;
}

/**
 * `handler`, the operations endpoint's, noting for `resourceTypeOf` the
 * type of the operation a request failed in. The error is thrown on to
 * the error handler unchanged.
 */
export function notingFailedType<TEnv extends Env>(
  handler: (c: Context<TEnv>, next: Next) => Promise<Response>,
  resolveHref: (href: string) => OperationTarget | undefined,
  served: ReadonlySet<string>,
): (c: Context<TEnv>, next: Next) => Promise<Response> {
  return async (c, next) => {
    try {
      return await handler(c, next);
    } catch (error) {
      const type = await failedType(c, error, resolveHref, served);
      if (type !== undefined) {
        noteType(c, type);
      }
      throw error;
    }
  };
}
