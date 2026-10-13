/**
 * Moving a refusal's items to where the request held the input (resource
 * SPEC 19.3, 19.4). The runtime points an item into the resource object
 * at `/data` (SPEC 12.10). A relationship document holds the linkage at
 * `/data` itself, so an item at the relationship, or under its linkage,
 * moves there, and an item at another member, which the document does not
 * hold, loses its pointer rather than point at nothing. An operations
 * document holds an operation's resource object, or its linkage, at
 * `/atomic:operations/<index>/data`.
 * @ref https://jsonapi.org/format/1.1/#error-objects ("pointer: a JSON Pointer [RFC6901] to the value in the request document that caused the error")
 * @ref https://www.rfc-editor.org/rfc/rfc6901
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/hono-jsonapi';

import { BanError, isBanError } from '@nizam-os/hono-jsonapi';

/** An item's path: RFC 6901 reference tokens. */
export type Path = NonNullable<ErrorItem['path']>;

const DATA = 'data';
const RELATIONSHIPS = 'relationships';

/**
 * Where `path` goes when the resource object sits at `base`: the object
 * and its members under `base`, and anything else nowhere.
 */
export function objectPath(path: Path, base: Path): Path | undefined {
  const [data, ...rest] = path;
  return data === DATA ? [...base, ...rest] : undefined;
}

/**
 * Where `path` goes when the input of relationship `name` sits at `base`:
 * the relationship itself at `base`, its linkage under it, and any other
 * member nowhere.
 */
export function linkagePath(
  path: Path,
  name: string,
  base: Path,
): Path | undefined {
  const [data, group, member, linkage, ...rest] = path;
  if (data !== DATA || group !== RELATIONSHIPS || member !== name) {
    return undefined;
  }
  if (linkage === undefined) {
    return base;
  }
  return linkage === DATA ? [...base, ...rest] : undefined;
}

/** Where a path into the body goes, or nowhere. */
export type Move = (path: Path) => Path | undefined;

/** Where a path into the body goes when the request holds no input there: nowhere. */
export function nowhere(): undefined {
  return undefined;
}

/** `item` moved by `move` when it points into the body, or without its pointer. */
function movedItem(item: ErrorItem, move: Move): ErrorItem {
  const { path, ...rest } = item;
  if (
    path === undefined ||
    (item.location !== undefined && item.location !== 'body')
  ) {
    return item;
  }
  const moved = move(path);
  return moved === undefined ? rest : { ...rest, path: moved };
}

/**
 * `error` with each item that points into the body moved by `move`, and
 * without its pointer where `move` gives no path. An error without items
 * is returned as it is.
 */
export function movedError(error: BanError, move: Move): BanError {
  if (error.errors === undefined) {
    return error;
  }
  const errors = error.errors.map((item) => movedItem(item, move));
  return new BanError({ ...error.toInit(), errors });
}

/** `movedError` of a `BanError`; anything else as it is. */
export function moveItems(error: unknown, move: Move): unknown {
  return isBanError(error) ? movedError(error, move) : error;
}
