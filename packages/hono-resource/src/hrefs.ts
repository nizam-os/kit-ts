/**
 * The targets an `href` names (resource SPEC 19.4), which an operation may
 * give instead of `ref`. Resolved against the endpoint's URL, an `href`
 * with the links' origin, no query, no fragment, and a path a route
 * matches, as Hono matches a request's path, names what the route serves:
 * a collection path its type, for an `add`; a resource path that
 * resource; a relationship link that relationship. Anything else, a
 * related link among them, names nothing, which the processor answers
 * 400. When the links are root-relative, an absolute `href` names nothing:
 * the resolver does not see the request's origin.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects ("href: a string that contains a URI-reference [RFC3986 Section 4.1] that identifies the target of the operation")
 * @ref https://jsonapi.org/ext/atomic/#auto-id-creating-resources ("MAY target a resource collection through the operation's href member")
 * @ref https://www.rfc-editor.org/rfc/rfc3986#section-5.2 (resolving a reference against a base URI)
 * @ref https://github.com/honojs/hono/blob/v4.13.13/src/request.ts (a parameter is decoded by `tryDecodeURIComponent`)
 * @ref https://github.com/honojs/hono/pull/5158 (`hono/utils/url` exports it from 4.13.0; the peer range starts later, at 4.13.7)
 * @packageDocumentation
 */
import type { OperationTarget } from '@nizam-os/hono-jsonapi/atomic';

import type { MountedResource, PathPlan } from './paths';

import { tryDecodeURIComponent } from 'hono/utils/url';

import { PARAMETER, requestPath } from './paths';

/** The origin a root-relative `href` resolves against; never part of a target. */
const PLACEHOLDER = 'http://placeholder.invalid';

/** The id `path` holds where `route` holds `:id`, decoded as Hono decodes a parameter, when `path` is `route`'s. */
function idIn(route: string, path: string): string | undefined {
  const [prefix, suffix, ...more] = route.split(PARAMETER);
  if (
    prefix === undefined ||
    suffix === undefined ||
    more.length > 0 ||
    !path.startsWith(prefix) ||
    !path.endsWith(suffix)
  ) {
    return undefined;
  }
  const id = path.slice(prefix.length, path.length - suffix.length);
  return id === '' || id.includes('/') ? undefined : tryDecodeURIComponent(id);
}

/** What `path`, as Hono matches it, names among `mounted`'s routes. */
function targetIn(
  mounted: MountedResource,
  path: string,
): OperationTarget | undefined {
  const { declared, paths } = mounted;
  const { type } = declared.resource;
  if (path === paths.collection) {
    return { type };
  }
  const id = idIn(paths.resource, path);
  if (id !== undefined) {
    return { type, id };
  }
  for (const [relationship, links] of paths.relationships) {
    const owner = links.self === undefined ? undefined : idIn(links.self, path);
    if (owner !== undefined) {
      return { type, id: owner, relationship };
    }
  }
  return undefined;
}

/**
 * The resolver of `plan`'s routes for the endpoint at `endpoint`, a route
 * of the plan's base: an `href` names what the first route its path
 * matches serves, in the order the routes are mounted.
 */
export function hrefTargets(
  plan: PathPlan,
  endpoint: string,
): (href: string) => OperationTarget | undefined {
  const base = new URL(endpoint, plan.origin ?? PLACEHOLDER);
  return (href): OperationTarget | undefined => {
    if (!URL.canParse(href, base)) {
      return undefined;
    }
    const url = new URL(href, base);
    if (url.origin !== base.origin || url.search !== '' || url.hash !== '') {
      return undefined;
    }
    const path = requestPath(url.pathname);
    for (const mounted of plan.resources) {
      const target = targetIn(mounted, path);
      if (target !== undefined) {
        return target;
      }
    }
    return undefined;
  };
}
