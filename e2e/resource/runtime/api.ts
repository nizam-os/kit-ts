/**
 * The contacts application's HTTP API (resource SPEC 12.3, 13.1), as
 * `@nizam-os/hono-resource` will mount it: Hono with `@nizam-os/hono-jsonapi`
 * for negotiation, the request validators, `respond`, and the error
 * handler, and behind each declared operation of contacts and calls the
 * runtime `createResourceRuntime` booted, typed wide as a host takes any
 * application's, each request running `runtime.as(member)`. The runtime
 * maps a keyset refusal to the request's error itself (SPEC 18.5). The
 * `X-Actor` header names the member a request acts as, in place of the
 * application's authentication, which answers `UNAUTHORIZED` without a
 * member it knows. Every response is built by the published packages, so
 * the OpenAPI tests hold the document against what a host answers.
 * @ref https://jsonapi.org/format/1.1/#crud
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 */
import type { Context } from 'hono';

import type {
  Included,
  JsonApiVariables,
  ParsedQuery,
} from '@nizam-os/hono-jsonapi';
import type {
  ResourceOperations,
  ResourceRuntime,
} from '@nizam-os/kysely-resource';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type { PublicRow } from '@nizam-os/resource-core/server';

import type { AppActor, AppDomain } from './domain.ts';

import { Hono } from 'hono';

import {
  bodyValidator,
  CURSOR_PAGINATION_PROFILE,
  errorHandler,
  include,
  jsonApi,
  jsonApiError,
  notFoundHandler,
  paginatedDocument,
  queryValidator,
  resourceDocument,
  respond,
} from '@nizam-os/hono-jsonapi';
import { keysetRequest } from '@nizam-os/resource-core/server';

import { Calls } from '../resources/calls.ts';
import { Contacts } from '../resources/contacts.ts';
import { Meetings } from '../resources/meetings.ts';
import { Notes } from '../resources/notes.ts';
import { Organizations } from '../resources/organizations.ts';
import { editor, globex, manager, stranger, viewer } from './fixture.ts';

/** The application's registry: every resource its document lists, each linked under `/api`. */
export const APP_RESOURCES: ReadonlyArray<DeclaredResource> = [
  Organizations,
  Contacts,
  Meetings,
  Notes,
  Calls,
];

/** The application's `Env`: `jsonApi()`'s variables and the request's member. */
export interface AppEnv {
  readonly Variables: JsonApiVariables & { readonly actor: AppActor };
}

const CREATED = 201;
const NO_CONTENT = 204;
const ACTORS: ReadonlyMap<string, AppActor> = new Map([
  ['editor', editor],
  ['viewer', viewer],
  ['stranger', stranger],
  ['manager', manager],
  ['globex', globex],
]);
const BY_TYPE: ReadonlyMap<string, DeclaredResource> = new Map(
  APP_RESOURCES.map((resource) => [resource.names.type, resource]),
);

/** The member an `X-Actor` header names; `UNAUTHORIZED` for any other value. */
function actorOf(header: string | undefined): AppActor {
  const actor = ACTORS.get(header ?? '');
  if (actor === undefined) {
    throw jsonApiError('UNAUTHORIZED', {
      detail: 'The request names no member.',
    });
  }
  return actor;
}

/** The `:id` Hono matched on a member route. */
function memberId(c: Context<AppEnv>): string {
  const id = c.req.param('id');
  if (id === undefined) {
    throw new TypeError('a member route has an id');
  }
  return id;
}

/** The application's runtime as a host takes it: any resource may have any operation. */
type AppRuntime = ResourceRuntime<AppDomain>;

/** `name` of `operations`, which a route runs only when the declaration declares it. */
function operation<TName extends keyof ResourceOperations>(
  operations: ResourceOperations,
  name: TName,
): NonNullable<ResourceOperations[TName]> {
  const found = operations[name];
  if (found === undefined) {
    throw new TypeError(`the runtime has no ${name} for a declared operation`);
  }
  return found;
}

/** The operations of `resource` as the request's member runs them. */
function operationsOf(
  runtime: AppRuntime,
  c: Context<AppEnv>,
  resource: DeclaredResource,
): ResourceOperations {
  const operations = runtime.as(c.get('actor'))[resource.names.type];
  if (operations === undefined) {
    throw new TypeError(
      `${resource.names.type} has no behavior in the runtime`,
    );
  }
  return operations;
}

/**
 * The rows each requested relationship links `rows` to. Only a declared
 * resource's own relationships are includable, so every path `parseQuery`
 * accepted here has one segment.
 */
async function included(
  operations: ResourceOperations,
  declared: DeclaredResource,
  rows: ReadonlyArray<PublicRow>,
  query: ParsedQuery,
): Promise<Array<Included>> {
  const out: Array<Included> = [];
  for (const [relationship] of query.include ?? []) {
    const definition =
      relationship === undefined
        ? undefined
        : declared.resource.relationships[relationship];
    const target =
      definition === undefined ? undefined : BY_TYPE.get(definition.type);
    if (relationship === undefined || target === undefined) {
      throw new TypeError('an accepted include names no listed resource');
    }
    const linked = await operation(operations, 'include')(relationship, rows);
    out.push(include(target.resource, linked));
  }
  return out;
}

/** The routes of `declared`'s operations, at `/api/<type>`. */
function mount(
  app: Hono<AppEnv>,
  runtime: AppRuntime,
  declared: DeclaredResource,
): void {
  const { resource } = declared;
  const operations: ReadonlySet<string> = new Set(
    declared.declaration.operations,
  );
  const collection = `/api/${resource.type}`;
  const member = `${collection}/:id`;
  if (operations.has('list')) {
    app.get(collection, queryValidator(resource), async (c) => {
      const query = c.req.valid('query');
      const domain = operationsOf(runtime, c, declared);
      const page = await operation(
        domain,
        'list',
      )(keysetRequest(declared, query));
      const linked = await included(domain, declared, page.rows, query);
      return respond(
        c,
        paginatedDocument(resource, page, {
          url: c.req.url,
          query,
          included: linked,
        }),
      );
    });
  }
  if (operations.has('create')) {
    const body = bodyValidator(resource, { operation: 'create' });
    app.post(collection, body, async (c) => {
      const domain = operationsOf(runtime, c, declared);
      const row = await operation(domain, 'create')(c.req.valid('json'));
      return respond(c, resourceDocument(resource, row), CREATED);
    });
  }
  if (operations.has('get')) {
    app.get(member, queryValidator(resource), async (c) => {
      const query = c.req.valid('query');
      const domain = operationsOf(runtime, c, declared);
      const row = await operation(domain, 'get')(memberId(c));
      const linked = await included(domain, declared, [row], query);
      return respond(
        c,
        resourceDocument(resource, row, { query, included: linked }),
      );
    });
  }
  if (operations.has('update')) {
    const body = bodyValidator(resource, { operation: 'update' });
    app.patch(member, body, async (c) => {
      const domain = operationsOf(runtime, c, declared);
      const row = await operation(domain, 'update')(
        memberId(c),
        c.req.valid('json'),
      );
      return respond(c, resourceDocument(resource, row));
    });
  }
  if (operations.has('remove')) {
    app.delete(member, async (c) => {
      const domain = operationsOf(runtime, c, declared);
      await operation(domain, 'remove')(memberId(c));
      return c.body(null, NO_CONTENT);
    });
  }
}

/** The API over `runtime`: negotiation first, then the member, then the routes. */
export function createApi(runtime: AppRuntime): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(jsonApi({ profiles: [CURSOR_PAGINATION_PROFILE] }));
  app.use('/api/*', async (c, next) => {
    c.set('actor', actorOf(c.req.header('X-Actor')));
    await next();
  });
  app.onError(errorHandler());
  app.notFound(notFoundHandler());
  for (const declared of [Contacts, Calls]) {
    mount(app, runtime, declared);
  }
  return app;
}
