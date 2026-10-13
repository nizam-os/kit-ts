/**
 * A collection's routes (resource SPEC 19.3), each only when its operation
 * is declared: `GET` runs `list` with the query as `keysetRequest` hands
 * it to the keyset and with its `filterParameters`, so a refused filter
 * value's error names the parameter it came in, then each include, and
 * answers the page with the Cursor Pagination profile's links and meta;
 * `POST` runs `create` with the parsed document and answers 201, whose
 * `Location` is the row's `links.self`.
 * @ref https://jsonapi.org/format/1.1/#fetching-resources
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-201
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 * @packageDocumentation
 */
import type { Env } from 'hono';

import type { DomainShape } from '@nizam-os/resource-core/server';

import type { RouteContext } from './context';
import type { MountedResource } from './paths';

import {
  bodyValidator,
  paginatedDocument,
  queryValidator,
  resourceDocument,
  respond,
} from '@nizam-os/hono-jsonapi';
import { filterParameters, keysetRequest } from '@nizam-os/resource-core/server';

import { includedOf, notRun, operationsOf } from './context';
import { allow } from './methods';
import { servesType } from './resource-type';

const HTTP_CREATED = 201;

/** Mounts `list` and `create` of `mounted` at its collection path. */
export function collectionRoutes<TEnv extends Env, TDomain extends DomainShape>(
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
  if (operations.has('list')) {
    app.get(
      paths.collection,
      serves,
      actors.resolve,
      queryValidator(resource),
      async (c) => {
        const query = c.req.valid('query');
        const domain = operationsOf(context, c, declared);
        if (domain.list === undefined) {
          throw notRun(declared, 'list');
        }
        const page = await domain.list(keysetRequest(declared, query), {
          parameters: filterParameters(declared, query),
        });
        const included = await includedOf(
          context,
          domain,
          declared,
          page.rows,
          query,
        );
        return respond(
          c,
          paginatedDocument(resource, page, {
            url: c.req.url,
            query,
            included,
          }),
        );
      },
    );
    allow(methods, paths.collection, 'GET');
  }
  if (operations.has('create')) {
    app.post(
      paths.collection,
      serves,
      actors.resolve,
      bodyValidator(resource, { operation: 'create' }),
      async (c) => {
        const domain = operationsOf(context, c, declared);
        if (domain.create === undefined) {
          throw notRun(declared, 'create');
        }
        const row = await domain.create(c.req.valid('json'));
        return respond(c, resourceDocument(resource, row), HTTP_CREATED);
      },
    );
    allow(methods, paths.collection, 'POST');
  }
}
