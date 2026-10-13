/**
 * Context typing for the Hono integration (SPEC 10.1). Declare the app as
 * `new Hono<JsonApiEnv>()` (or intersect `JsonApiEnv` into an existing
 * `Env`) so `c.get('jsonApi')` is typed in handlers after `jsonApi()`.
 * @packageDocumentation
 */
import type { NegotiatedRequest } from '@nizam-os/jsonapi-core';

/** What `jsonApi()` negotiated for the current request. */
export interface JsonApiContext {
  /** What the request declared about its own body. */
  readonly request: NegotiatedRequest;
  /** Extension URIs the response MUST apply (from the chosen `Accept` instance). */
  readonly extensions: ReadonlyArray<string>;
  /** Supported profile URIs the client asked for, in request order. */
  readonly profiles: ReadonlyArray<string>;
}

export interface JsonApiVariables {
  readonly jsonApi: JsonApiContext;
}

/** The `Env` contribution of `jsonApi()`. */
export interface JsonApiEnv {
  readonly Variables: JsonApiVariables;
}
