/**
 * `createClients(definitions, transport)` (SPEC 15.4, ADR 0017): a client
 * per definition, typed by the definitions passed. Each definition's paths
 * come from its links through `resourcePaths`, the function the routes and
 * the OpenAPI document read them through, so all three name the same URLs.
 * Records find their definition by type, so two definitions with one type
 * are refused.
 * @packageDocumentation
 */
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { Clients } from './types';

import { resourcePaths } from '@nizam-os/jsonapi-core';

import { defineMember } from '../internal/object';
import { Transport } from '../transport/transport';
import { resourceClient } from './resource-client';

/**
 * The clients of `definitions`, by the names they are passed under,
 * sending through `transport`. Throws `TypeError` when a definition's
 * links give no paths, two definitions have one type, or `transport` was
 * not made by `createTransport`.
 */
export function createClients<
  TDefinitions extends Readonly<Record<string, AnyResource>>,
>(definitions: TDefinitions, transport: Transport): Clients<TDefinitions> {
  const state = Transport.stateOf(transport, 'createClients');
  const names = new Map<string, string>();
  // Each value is a `WideClient`, held as `unknown`: its `definition` is any
  // definition, which the assertion below types as the one passed.
  const clients: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    const other = names.get(definition.type);
    if (other !== undefined) {
      throw new TypeError(
        `createClients: ${other} and ${name} have one type, ${definition.type}; records find their definition by type`,
      );
    }
    names.set(definition.type, name);
    const paths = resourcePaths(definition, { caller: 'createClients' });
    defineMember(clients, name, resourceClient(definition, paths, state));
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the records are the server's, typed by the definitions it serializes with (ADR 0017); each response is held to the call's shape at run time, and the server stays the authority for what the types describe
  return clients as Clients<TDefinitions>;
}
