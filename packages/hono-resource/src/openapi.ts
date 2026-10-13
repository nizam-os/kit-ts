/**
 * The document's route (resource SPEC 19.5): with `openapi`, `GET
 * <base>/openapi.json` answers `openapi(runtime.resources, options)` as
 * `application/json`. The document is built once, when `jsonApiRoutes`
 * runs, so one that cannot be built, such as one with an invalid example,
 * throws there rather than on a request. It answers without an actor: a
 * client reads it before it has a session.
 * @ref https://spec.openapis.org/oas/v3.1.2.html
 * @packageDocumentation
 */
import type { Env } from 'hono';

import type { OpenApiOptions } from '@nizam-os/resource-core/openapi';
import type { DomainShape } from '@nizam-os/resource-core/server';

import type { RouteContext } from './context';
import type { PathPlan } from './paths';

import { openapi } from '@nizam-os/resource-core/openapi';

import { allow } from './methods';
import { claimRoute } from './paths';

const HTTP_OK = 200;

/** Mounts the document of `context`'s runtime at `<base>/openapi.json`, when `options` is given. */
export function documentRoute<TEnv extends Env, TDomain extends DomainShape>(
  context: RouteContext<TEnv, TDomain>,
  plan: PathPlan,
  options: OpenApiOptions | undefined,
): void {
  if (options === undefined) {
    return;
  }
  const path = `${plan.base}/openapi.json`;
  claimRoute(plan, path);
  const text = JSON.stringify(openapi(context.runtime.resources, options));
  context.app.get(path, (c) =>
    c.body(text, HTTP_OK, { 'Content-Type': 'application/json' }),
  );
  allow(context.methods, path, 'GET');
}
