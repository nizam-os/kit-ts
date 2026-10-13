/**
 * An operation's failure, addressed at the operation (SPEC 11.1): every
 * error object without a source of its own gets the operation's pointer,
 * as the extension asks, and an error without a list of items becomes one
 * item with its own identity and message. The processor applies it to
 * what an operation throws; a host whose transaction maps a failure once
 * it ended, outside the processor, applies it to that error, so both
 * point alike.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors ("the server SHOULD use the pointer ... to identify the operation that failed")
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import { BanError } from '@nizam-os/ban-core';

import { pathFromPointer } from '../internal/pointer';

/** The one item an error without a list renders as: its own identity and message. */
function itemOf(error: BanError): ErrorItem {
  return {
    status: error.status,
    code: error.code,
    title: error.title,
    ...(error.type === undefined ? {} : { type: error.type }),
    detail: error.message,
  };
}

/** The item, addressed at the operation. */
function pointedAt(item: ErrorItem, path: ReadonlyArray<string>): ErrorItem {
  return { ...item, path };
}

/**
 * `error` with the operation's `pointer` as the path of every item
 * without one. The error is rebuilt from its own fields (`toInit`), so its
 * id, headers, and rendering stay; an item with a `path` already points
 * somewhere, and an error whose items all do is returned as it is. Throws
 * `TypeError` for a `pointer` that is not an RFC 6901 pointer.
 */
export function errorAtOperation(error: BanError, pointer: string): BanError {
  const path = pathFromPointer(pointer);
  const items =
    error.errors === undefined || error.errors.length === 0
      ? [itemOf(error)]
      : error.errors;
  if (items.every((item) => item.path !== undefined)) {
    return error;
  }
  return new BanError({
    ...error.toInit(),
    errors: items.map((item) =>
      item.path === undefined ? pointedAt(item, path) : item,
    ),
  });
}
