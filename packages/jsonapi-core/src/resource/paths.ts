/**
 * The paths of a resource's operations (SPEC 5.4), read from its links:
 * the resource at `links.self(id)`, the collection at that path without
 * its last segment, each relationship's `self` and `related` links, and
 * the Atomic Operations endpoint at the collection's parent followed by
 * `/operations` (ADR 0023). A link is built for a marker id of unreserved
 * characters, which `encodeURIComponent` keeps, and the marker becomes the
 * template `{id}`. An absolute link splits into its origin and its path.
 * The OpenAPI document of `@nizam-os/resource-core`, the routes of
 * `@nizam-os/hono-resource`, and `@nizam-os/jsonapi-client` read paths only
 * through it, so all three name the same URLs (ADR 0017).
 * @ref https://jsonapi.org/recommendations/#urls
 * @ref https://jsonapi.org/ext/atomic/#processing (the extension's examples post to `/operations`)
 * @ref https://spec.openapis.org/oas/v3.1.2.html#path-templating
 * @packageDocumentation
 */
import type { AnyResource } from './types';

/** Where a resource's operations live. */
export interface ResourcePaths {
  /** An absolute link's origin, else `undefined`. */
  readonly origin: string | undefined;
  readonly collection: string;
  readonly resource: string;
  /** By relationship: its relationship link's and related link's paths, when the definition builds them. */
  readonly relationships: ReadonlyMap<
    string,
    { readonly self?: string; readonly related?: string }
  >;
  /** The Atomic Operations endpoint of the definitions under the collection's base. */
  readonly operations: string;
}

const MARKER = 'nizam-resource-id';
const TEMPLATE = '{id}';
/** Where the Atomic Operations endpoint sits under a base. */
const OPERATIONS_SEGMENT = '/operations';
/** A base for parsing a root-relative link; never part of a result. */
const PLACEHOLDER = 'http://placeholder.invalid';

interface Located {
  readonly origin: string | undefined;
  readonly path: string;
}

/** A link's origin and path, which must hold the marker once and no query or fragment. */
function locate(caller: string, what: string, link: string): Located {
  if (!link.startsWith('/') && !URL.canParse(link)) {
    throw new TypeError(
      `${caller}: ${what} must be an absolute URL or a path starting with "/"`,
    );
  }
  const url = new URL(link, PLACEHOLDER);
  if (
    url.search !== '' ||
    url.hash !== '' ||
    url.pathname.split(MARKER).length !== 2
  ) {
    throw new TypeError(
      `${caller}: ${what} must be a path that holds the id once, without a query or fragment`,
    );
  }
  return {
    origin: link.startsWith('/') ? undefined : url.origin,
    path: url.pathname.replace(MARKER, TEMPLATE),
  };
}

function sameOrigin(
  caller: string,
  what: string,
  first: Located,
  other: Located,
): string {
  if (first.origin !== other.origin) {
    throw new TypeError(
      `${caller}: ${what} has another origin than links.self`,
    );
  }
  return other.path;
}

/** How `resourcePaths` reports a link it cannot read. */
export interface ResourcePathsOptions {
  /** What each `TypeError` message starts with; default `resourcePaths`. */
  readonly caller?: string | undefined;
}

/**
 * The paths of `definition`'s operations, as the OpenAPI document lists
 * them, a host mounts its routes, and a client calls them; throws
 * `TypeError`, starting with `caller`, when its links cannot give them.
 */
export function resourcePaths(
  definition: AnyResource,
  options: ResourcePathsOptions = {},
): ResourcePaths {
  const caller = options.caller ?? 'resourcePaths';
  const { type, links } = definition;
  if (links.self === undefined) {
    throw new TypeError(
      `${caller}: ${type} has no links.self, so its paths are unknown; give the definer links.base`,
    );
  }
  const self = locate(caller, `${type} links.self`, links.self(MARKER));
  const suffix = `/${TEMPLATE}`;
  if (!self.path.endsWith(suffix) || self.path === suffix) {
    throw new TypeError(
      `${caller}: ${type} links.self must end with the id after the collection's path`,
    );
  }
  const relationships = new Map(
    Object.keys(definition.relationships).map((name) => {
      const built = links.relationship?.(MARKER, name) ?? {};
      const what = `${type} links.relationship(id, "${name}")`;
      const pathOf = (link: string): string =>
        sameOrigin(caller, what, self, locate(caller, what, link));
      return [
        name,
        {
          ...(built.self === undefined ? {} : { self: pathOf(built.self) }),
          ...(built.related === undefined
            ? {}
            : { related: pathOf(built.related) }),
        },
      ] as const;
    }),
  );
  const collection = self.path.slice(0, -suffix.length);
  return {
    origin: self.origin,
    collection,
    resource: self.path,
    relationships,
    operations: `${collection.slice(0, collection.lastIndexOf('/'))}${OPERATIONS_SEGMENT}`,
  };
}
