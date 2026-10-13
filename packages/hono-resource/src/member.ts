/**
 * A resource's routes (resource SPEC 19.3), each only when its operation
 * is declared: `GET` runs `get`, then each include; `PATCH` runs `update`
 * with the parsed document, whose `id` must be the path's; `DELETE` runs
 * `remove` and answers 204. The id is the `:id` path parameter, which
 * Hono decodes.
 * @ref https://jsonapi.org/format/1.1/#fetching-resources
 * @ref https://jsonapi.org/format/1.1/#crud-updating-responses-200
 * @ref https://jsonapi.org/format/1.1/#crud-deleting-responses-204
 * @packageDocumentation
 */
import type { Env } from 'hono';

import type { DomainShape } from '@nizam-os/resource-core/server';

import type { RouteContext } from './context';
import type { MountedResource } from './paths';

import {
  bodyValidator,
  queryValidator,
  resourceDocument,
  respond,
} from '@nizam-os/hono-jsonapi';

import { idOf, includedOf, notRun, operationsOf } from './context';
import { allow } from './methods';
import { servesType } from './resource-type';

const HTTP_NO_CONTENT = 204;

/** Mounts `get`, `update`, and `remove` of `mounted` at its resource path. */
export function memberRoutes<TEnv extends Env, TDomain extends DomainShape>(
  context: RouteContext<TEnv, TDomain>,
  mounted: MountedResource,
): void {
  const { app, actors, methods } = context;
  const { declared, paths } = mounted;
  const { resource } = declared;
  const operations: ReadonlySet<string> = new Set(
    declared.declaration.operations,
  );
  const serves = servesType(declared.names.type);
  if (operations.has('get')) {
    app.get(
      paths.resource,
      serves,
      actors.resolve,
      queryValidator(resource),
      async (c) => {
        const query = c.req.valid('query');
        const domain = operationsOf(context, c, declared);
        if (domain.get === undefined) {
          throw notRun(declared, 'get');
        }
        const row = await domain.get(idOf(c));
        const included = await includedOf(
          context,
          domain,
          declared,
          [row],
          query,
        );
        return respond(c, resourceDocument(resource, row, { query, included }));
      },
    );
    allow(methods, paths.resource, 'GET');
  }
  if (operations.has('update')) {
    app.patch(
      paths.resource,
      serves,
      actors.resolve,
      bodyValidator(resource, { operation: 'update' }),
      async (c) => {
        const domain = operationsOf(context, c, declared);
        if (domain.update === undefined) {
          throw notRun(declared, 'update');
        }
        const row = await domain.update(idOf(c), c.req.valid('json'));
        return respond(c, resourceDocument(resource, row));
      },
    );
    allow(methods, paths.resource, 'PATCH');
  }
  if (operations.has('remove')) {
    app.delete(paths.resource, serves, actors.resolve, async (c) => {
      const domain = operationsOf(context, c, declared);
      if (domain.remove === undefined) {
        throw notRun(declared, 'remove');
      }
      await domain.remove(idOf(c));
      return c.body(null, HTTP_NO_CONTENT);
    });
    allow(methods, paths.resource, 'DELETE');
  }
}
