/**
 * The methods each path answers (resource SPEC 19.2), and the
 * `METHOD_NOT_ALLOWED` (405) of any other, whose `Allow` header lists
 * them: `HEAD` beside `GET`, since Hono answers `HEAD` with the `GET`
 * route. The 405 answers before the actor resolves: the OpenAPI document
 * lists every path's methods to anyone.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.6 ("The origin server MUST generate an Allow header field in a 405 response")
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-10.2.1 (Allow)
 * @ref https://hono.dev/docs/api/routing
 * @packageDocumentation
 */
import type { Env, Hono } from 'hono';

import { jsonApiError } from '@nizam-os/hono-jsonapi';

/** A method a route answers. */
export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** By route, the methods it answers, in the order they were added. */
export type MethodTable = Map<string, Set<Method>>;

/** Every method `Allow` may list, in the order it lists them. */
const ALLOW_ORDER: ReadonlyArray<string> = [
  'GET',
  'HEAD',
  'POST',
  'PATCH',
  'DELETE',
];

/** Records that `route` answers `method`. */
export function allow(table: MethodTable, route: string, method: Method): void {
  const methods = table.get(route) ?? new Set<Method>();
  methods.add(method);
  table.set(route, methods);
}

/** The `Allow` header of a route that answers `methods`. */
function allowHeader(methods: ReadonlySet<string>): string {
  return ALLOW_ORDER.filter(
    (method) =>
      methods.has(method) || (method === 'HEAD' && methods.has('GET')),
  ).join(', ');
}

/**
 * Answers every method a route of `table` does not with 405. Call it
 * after the routes, so each route's own method matches first.
 */
export function refuseOtherMethods<TEnv extends Env>(
  app: Hono<TEnv>,
  table: MethodTable,
): void {
  for (const [route, methods] of table) {
    const header = allowHeader(methods);
    app.all(route, () => {
      throw jsonApiError('METHOD_NOT_ALLOWED', {
        detail: 'The path does not support this method',
        headers: { Allow: header },
      });
    });
  }
}
