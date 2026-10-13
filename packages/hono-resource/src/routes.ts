/**
 * `jsonApiRoutes(options)` (resource SPEC 19.2): the routes of a runtime
 * of the contract (SPEC 12.10) on Hono, at the full paths each resource's
 * links name, and the Atomic Operations endpoint (SPEC 19.4) and the
 * OpenAPI document (SPEC 19.5) beside them, for the host to mount at `/`
 * behind `jsonApi()`, its error handler, and `notFound`. A route maps a request to an operation's input and its
 * result to a document: `@nizam-os/hono-jsonapi` negotiates, validates,
 * and builds documents, the runtime authorizes and runs, and the host's
 * ban renders every error.
 * @ref https://jsonapi.org/format/1.1/
 * @ref https://hono.dev/docs/api/routing#grouping
 * @packageDocumentation
 */
import type { Env } from 'hono';

import type { OpenApiOptions } from '@nizam-os/resource-core/openapi';
import type {
  DomainShape,
  ResourceRuntime,
} from '@nizam-os/resource-core/server';

import type { ActorOf } from './actor';
import type { RouteContext } from './context';

import { Hono } from 'hono';

import { actors } from './actor';
import { collectionRoutes } from './collection';
import { targetsOf } from './context';
import { memberRoutes } from './member';
import { refuseOtherMethods } from './methods';
import { documentRoute } from './openapi';
import { operationsRoute } from './operations';
import { planPaths } from './paths';
import { relationshipRoutes } from './relationships';

/** What `jsonApiRoutes` takes. */
export interface JsonApiRoutesOptions<
  TEnv extends Env,
  TDomain extends DomainShape,
> {
  /** A runtime of the contract, such as `createResourceRuntime` resolves to; its `resources` are what the routes serve. */
  readonly runtime: ResourceRuntime<TDomain>;
  /**
   * The actor a request runs as. It runs once per request, before the
   * query or the document is read; what it throws, such as
   * `UNAUTHORIZED`, is the response.
   */
  readonly actor: ActorOf<TEnv, TDomain['actor']>;
  /**
   * The options of `openapi` (resource SPEC 13.1), whose resources are the
   * runtime's: with them, `<base>/openapi.json` serves the document.
   */
  readonly openapi?: OpenApiOptions | undefined;
}

const OPTIONS: ReadonlySet<string> = new Set(['runtime', 'actor', 'openapi']);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/** Throws `TypeError` for options a JavaScript caller got wrong. */
function checkOptions(options: unknown): void {
  if (!isRecord(options)) {
    throw new TypeError('jsonApiRoutes: options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!OPTIONS.has(key)) {
      throw new TypeError(`jsonApiRoutes: options.${key} is not an option`);
    }
  }
  const { runtime, actor, openapi } = options;
  if (
    !isRecord(runtime) ||
    !Array.isArray(runtime['resources']) ||
    typeof runtime['as'] !== 'function' ||
    typeof runtime['transaction'] !== 'function'
  ) {
    throw new TypeError(
      'jsonApiRoutes: options.runtime must be a runtime of the contract, such as createResourceRuntime resolves to',
    );
  }
  if (typeof actor !== 'function') {
    throw new TypeError(
      'jsonApiRoutes: options.actor must be a function from the request to its actor',
    );
  }
  if (openapi !== undefined && !isRecord(openapi)) {
    throw new TypeError(
      "jsonApiRoutes: options.openapi must be openapi's options",
    );
  }
}

/**
 * The routes of `options.runtime`'s resources, its operations endpoint
 * when a resource declares a write, and its document with
 * `options.openapi`. Throws `TypeError` before it serves anything when the
 * runtime runs no resource, when a resource's links give no paths, when
 * the links have different origins or bases, when two routes have one
 * path, the endpoint's or the document's among them, or when a
 * relationship's target is not among the runtime's resources; what
 * `openapi` throws for its options, such as an invalid example, it throws
 * too.
 */
export function jsonApiRoutes<TEnv extends Env, TDomain extends DomainShape>(
  options: JsonApiRoutesOptions<TEnv, TDomain>,
): Hono<TEnv> {
  checkOptions(options);
  const { runtime } = options;
  const plan = planPaths(runtime.resources);
  const app = new Hono<TEnv>();
  const context: RouteContext<TEnv, TDomain> = {
    app,
    runtime,
    actors: actors(options.actor),
    methods: new Map(),
    targets: targetsOf(runtime.resources),
  };
  for (const mounted of plan.resources) {
    collectionRoutes(context, mounted);
    memberRoutes(context, mounted);
    relationshipRoutes(context, mounted);
  }
  operationsRoute(context, plan);
  documentRoute(context, plan, options.openapi);
  refuseOtherMethods(app, context.methods);
  return app;
}
