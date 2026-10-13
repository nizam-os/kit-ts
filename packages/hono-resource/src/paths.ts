/**
 * Where the routes sit (resource SPEC 19.2): each resource's paths, read
 * from its JSON:API links by `resourcePaths` (jsonapi SPEC 5.4), the
 * function the OpenAPI document reads and a client calls through, so the
 * routes, the links, the document, and the client name the same URLs. Every
 * resource shares one origin, one base (the collection path without its last
 * segment), and one Atomic Operations endpoint (the operations path its
 * links give); no two routes name one path. A route is written as Hono's
 * router reads a request's path: `{id}` as `:id`, and decoded by `decodeURI`
 * but for `%25`, as Hono's `getPath` decodes, so a type outside ASCII routes
 * as its links spell it.
 * @ref https://hono.dev/docs/api/routing
 * @ref https://github.com/honojs/hono/blob/v4.13.13/src/utils/url.ts (getPath: `path.replace(/%25/g, '%2525')`, then `tryDecodeURI`)
 * @packageDocumentation
 */
import type { ResourcePaths } from '@nizam-os/hono-jsonapi';
import type { DeclaredResource } from '@nizam-os/resource-core';

import { tryDecodeURI } from 'hono/utils/url';

import { resourcePaths } from '@nizam-os/hono-jsonapi';

/** A relationship's routes: its relationship link's and its related link's, where the definition builds them. */
interface RelationshipRoutes {
  readonly self?: string | undefined;
  readonly related?: string | undefined;
}

/** One resource's routes, as Hono matches them. */
interface RoutePaths {
  readonly collection: string;
  readonly resource: string;
  /** By relationship name. */
  readonly relationships: ReadonlyMap<string, RelationshipRoutes>;
}

/** A resource and where its routes sit. */
export interface MountedResource {
  readonly declared: DeclaredResource;
  readonly paths: RoutePaths;
}

/** What the routes mount: each resource, in the runtime's order, and the base they share. */
export interface PathPlan {
  /** The links' origin, when they are absolute. */
  readonly origin: string | undefined;
  /** As Hono matches it: `''` for root-relative links. */
  readonly base: string;
  /** The Atomic Operations endpoint's route: the operations path of the links (`ResourcePaths.operations`). */
  readonly operations: string;
  readonly resources: ReadonlyArray<MountedResource>;
  /** Every route the plan holds: the resources', and each endpoint's `claimRoute` added. */
  readonly routes: Set<string>;
}

const TEMPLATE = '{id}';
/** The id of a resource route, as Hono reads a path parameter. */
export const PARAMETER = ':id';
const ROOT_RELATIVE = 'root-relative';

/** `path` as Hono's router reads a request's: decoded by `decodeURI` but for `%25`. */
export function requestPath(path: string): string {
  return tryDecodeURI(path.replaceAll('%25', '%2525'));
}

/** Adds `route`, an endpoint's beside the resources', to `plan`; a `TypeError` when a route has it. */
export function claimRoute(plan: PathPlan, route: string): void {
  if (plan.routes.has(route)) {
    throw new TypeError(`jsonApiRoutes: two routes have the path ${route}`);
  }
  plan.routes.add(route);
}

/** `path`, which holds `{id}` at most once, as a Hono route. */
export function routeOf(path: string): string {
  return path
    .split(TEMPLATE)
    .map((part) => requestPath(part))
    .join(PARAMETER);
}

/** The one value of `values`, by resource; a `TypeError` naming them all when they differ. */
function shared(
  values: ReadonlyArray<string>,
  what: string,
  why: string,
): string {
  const distinct = [...new Set(values)];
  const [value] = distinct;
  if (value === undefined || distinct.length > 1) {
    throw new TypeError(
      `jsonApiRoutes: the resources' links have different ${what} (${distinct.join(', ')}); ${why}`,
    );
  }
  return value;
}

/** `links`' paths as routes, each paired with the path its links spell. */
function routesOf(links: ResourcePaths): {
  readonly paths: RoutePaths;
  readonly pairs: ReadonlyArray<readonly [string, string]>;
} {
  const pairs: Array<readonly [string, string]> = [];
  const route = (path: string): string => {
    const routed = routeOf(path);
    pairs.push([path, routed]);
    return routed;
  };
  const collection = route(links.collection);
  const resource = route(links.resource);
  const relationships = new Map(
    [...links.relationships].map(([name, link]) => [
      name,
      {
        ...(link.self === undefined ? {} : { self: route(link.self) }),
        ...(link.related === undefined ? {} : { related: route(link.related) }),
      },
    ]),
  );
  return { paths: { collection, resource, relationships }, pairs };
}

/**
 * Each resource's routes, and the base and the operations path they
 * share. Throws `TypeError` when there is no resource, when a resource's
 * links give no paths (`resourcePaths`), when the links have different
 * origins, bases, or operations paths, or when two routes have one path.
 */
export function planPaths(
  resources: ReadonlyArray<DeclaredResource>,
): PathPlan {
  if (resources.length === 0) {
    throw new TypeError(
      'jsonApiRoutes: the runtime runs no resource, so there is nothing to serve',
    );
  }
  const located = resources.map((declared) => ({
    declared,
    links: resourcePaths(declared.resource),
  }));
  const origin = shared(
    located.map(({ links }) => links.origin ?? ROOT_RELATIVE),
    'origins',
    'the routes serve one',
  );
  const base = shared(
    located.map(({ links }) =>
      links.collection.slice(0, links.collection.lastIndexOf('/')),
    ),
    'bases',
    'every collection sits under one',
  );
  const operations = shared(
    located.map(({ links }) => links.operations),
    'operations paths',
    'one endpoint has one path',
  );
  const seen = new Set<string>();
  const mounted = located.map(({ declared, links }) => {
    const { paths, pairs } = routesOf(links);
    for (const [path, route] of pairs) {
      if (seen.has(route)) {
        throw new TypeError(`jsonApiRoutes: two routes have the path ${path}`);
      }
      seen.add(route);
    }
    return { declared, paths };
  });
  return {
    origin: origin === ROOT_RELATIVE ? undefined : origin,
    base: routeOf(base),
    operations: routeOf(operations),
    resources: mounted,
    routes: seen,
  };
}
