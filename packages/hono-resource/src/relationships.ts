/**
 * The routes of each relationship (resource SPEC 19.3), where the
 * definition builds its links and the resource declares `get`, as the
 * OpenAPI document lists them (SPEC 13.1): the relationship link's `GET`,
 * and its `PATCH` when the relationship is `readWrite` and the resource
 * declares `update`; the related link's `GET` when the target declares
 * `get`. Relationships are to-one (DESIGN 6). A relationship document is
 * the relationship object the resource object carries, its links and its
 * linkage. On a relationship link, an update the relationship does not
 * support answers 403, as JSON:API requires, before the actor, as a 405
 * does: the document lists every update that exists.
 * @ref https://jsonapi.org/format/1.1/#fetching-relationships-responses-200
 * @ref https://jsonapi.org/format/1.1/#crud-updating-to-one-relationships
 * @ref https://jsonapi.org/format/1.1/#crud-updating-relationship-responses-403 ("A server MUST return 403 Forbidden in response to an unsupported request to update a relationship")
 * @ref https://jsonapi.org/format/1.1/#fetching-resources-responses-200 (an empty related resource link answers `null` as primary data)
 * @packageDocumentation
 */
import type { Env } from 'hono';

import type {
  ResourceIdentifier,
  ToOneRelationshipDocument,
} from '@nizam-os/hono-jsonapi';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type { DomainShape, PublicRow } from '@nizam-os/resource-core/server';

import type { RouteContext } from './context';
import type { MountedResource } from './paths';

import {
  jsonApiError,
  jsonApiObject,
  queryValidator,
  relationshipValidator,
  resourceDocument,
  respond,
  serializeResource,
} from '@nizam-os/hono-jsonapi';

import { idOf, includedOf, notRun, operationsOf, targetOf } from './context';
import { allow } from './methods';
import { linkagePath, moveItems } from './pointers';
import { servesType } from './resource-type';

const UNSUPPORTED = 'The relationship does not support this update';
/** Where a relationship document holds the linkage. */
const LINKAGE = ['data'];

/** `row`'s relationship `name` as the resource object carries it. */
function relationshipOf(
  declared: DeclaredResource,
  row: PublicRow,
  name: string,
): ToOneRelationshipDocument {
  const relationship = serializeResource(declared.resource, row)
    .relationships?.[name];
  const data = relationship?.data;
  if (data !== null && (data === undefined || !('id' in data))) {
    throw new TypeError(
      `jsonApiRoutes: the runtime's row of ${declared.names.type} holds no ${name}, which its declaration declares`,
    );
  }
  const links = relationship?.links;
  return {
    jsonapi: jsonApiObject(),
    ...(links === undefined ? {} : { links }),
    data,
  };
}

/** The relationship link's routes of `declared`'s relationship `name` at `path`. */
function selfRoutes<TEnv extends Env, TDomain extends DomainShape>(
  context: RouteContext<TEnv, TDomain>,
  declared: DeclaredResource,
  name: string,
  path: string,
): void {
  const { app, actors, methods } = context;
  const serves = servesType(declared.names.type);
  app.get(path, serves, actors.resolve, async (c) => {
    const domain = operationsOf(context, c, declared);
    if (domain.get === undefined) {
      throw notRun(declared, 'get');
    }
    return respond(
      c,
      relationshipOf(declared, await domain.get(idOf(c)), name),
    );
  });
  allow(methods, path, 'GET');
  const updates =
    declared.declaration.operations.includes('update') &&
    declared.resource.writable.update.has(name);
  if (updates) {
    app.patch(
      path,
      serves,
      actors.resolve,
      relationshipValidator(declared.resource, name, 'one'),
      async (c) => {
        const domain = operationsOf(context, c, declared);
        if (domain.update === undefined) {
          throw notRun(declared, 'update');
        }
        const linkage: ResourceIdentifier | null = c.req.valid('json');
        const row = await domain
          .update(idOf(c), { relationships: { [name]: linkage } })
          .catch((error: unknown) => {
            throw moveItems(error, (item) => linkagePath(item, name, LINKAGE));
          });
        return respond(c, relationshipOf(declared, row, name));
      },
    );
    allow(methods, path, 'PATCH');
  }
  app.on(
    updates ? ['POST', 'DELETE'] : ['PATCH', 'POST', 'DELETE'],
    path,
    serves,
    () => {
      throw jsonApiError('FORBIDDEN', { detail: UNSUPPORTED });
    },
  );
}

/** The related link's route of `declared`'s relationship `name` at `path`, when its target serves `get`. */
function relatedRoute<TEnv extends Env, TDomain extends DomainShape>(
  context: RouteContext<TEnv, TDomain>,
  declared: DeclaredResource,
  name: string,
  path: string,
): void {
  const target = targetOf(context, declared, name);
  if (!target.declaration.operations.includes('get')) {
    return;
  }
  const { app, actors, methods } = context;
  app.get(
    path,
    servesType(target.names.type),
    actors.resolve,
    queryValidator(target.resource),
    async (c) => {
      const query = c.req.valid('query');
      const source = operationsOf(context, c, declared);
      if (source.get === undefined) {
        throw notRun(declared, 'get');
      }
      const { data } = relationshipOf(
        declared,
        await source.get(idOf(c)),
        name,
      );
      if (data === null) {
        return respond(c, resourceDocument(target.resource, null, { query }));
      }
      const domain = operationsOf(context, c, target);
      if (domain.get === undefined) {
        throw notRun(target, 'get');
      }
      const row = await domain.get(data.id);
      const included = await includedOf(context, domain, target, [row], query);
      return respond(
        c,
        resourceDocument(target.resource, row, { query, included }),
      );
    },
  );
  allow(methods, path, 'GET');
}

/** Mounts the routes of each relationship of `mounted`, when its resource declares `get`. */
export function relationshipRoutes<
  TEnv extends Env,
  TDomain extends DomainShape,
>(context: RouteContext<TEnv, TDomain>, mounted: MountedResource): void {
  const { declared, paths } = mounted;
  if (!declared.declaration.operations.includes('get')) {
    return;
  }
  for (const [name, links] of paths.relationships) {
    if (links.self !== undefined) {
      selfRoutes(context, declared, name, links.self);
    }
    if (links.related !== undefined) {
      relatedRoute(context, declared, name, links.related);
    }
  }
}
