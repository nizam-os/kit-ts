/**
 * RFC 6901 JSON Pointers for `source.pointer` members: construction from
 * path segments, and the reverse for handing a pointer to @nizam-os/ban-core, whose
 * error items carry the segments and render the pointer themselves.
 * @ref https://www.rfc-editor.org/rfc/rfc6901#section-3
 * @ref https://www.rfc-editor.org/rfc/rfc6901#section-4
 * @packageDocumentation
 */

/**
 * Escapes one reference token: `~` becomes `~0` before `/` becomes `~1`, the
 * order the RFC requires so `~1` in the input is not misread.
 */
export function escapePointerToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1');
}

/**
 * Unescapes one reference token: `~1` becomes `/` before `~0` becomes `~`,
 * the order section 4 prescribes so `~01` yields `~1` and not `/`.
 */
export function unescapePointerToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

/** Builds a pointer from path segments; an empty path is the whole document. */
export function pointer(path: ReadonlyArray<string | number>): string {
  return path
    .map((segment) => `/${escapePointerToken(String(segment))}`)
    .join('');
}

/**
 * The reference tokens of a pointer, unescaped: the inverse of `pointer`.
 * The whole document (`''`) has no tokens; anything else must start with
 * `/`, which is a `TypeError` otherwise since the text is not a pointer.
 */
export function pathFromPointer(value: string): Array<string> {
  if (value === '') {
    return [];
  }
  if (!value.startsWith('/')) {
    throw new TypeError(
      `"${value}" is not a JSON Pointer: it must be empty or start with "/"`,
    );
  }
  return value
    .slice(1)
    .split('/')
    .map((token) => unescapePointerToken(token));
}
