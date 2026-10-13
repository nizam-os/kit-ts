/**
 * `operationsMutation(transport, settings?)` (SPEC 17.4, ADR 0022): one
 * Atomic Operations request as mutation options, for any adapter's
 * `useMutation`. Its variables are operations `operationsOf` builds, so a
 * bulk action, or a create linked to another by its `lid`, is one write
 * that the server stores whole or not at all. On success it first removes
 * the `get` entries of every record a removal removed, so a screen still
 * showing one does not refetch a 404, then invalidates every type the
 * operations write and each key `settings.invalidates` names, and returns
 * that promise, so the mutation stays pending until the reads a screen
 * shows have refetched, as the single writes do (SPEC 16.4). A refused
 * request invalidates nothing, since the server stored none of it.
 * @ref https://jsonapi.org/ext/atomic/#processing ("A server MUST perform all operations atomically")
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
 * @ref https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientremovequeries
 * @packageDocumentation
 */
import type { QueryKey } from '@tanstack/query-core';

import type { Operation, Transport } from '@nizam-os/jsonapi-client';

import type { OperationsOptions, WriteSettings } from './query-types';

import { sendOperations } from '@nizam-os/jsonapi-client';

import { invalidate, settingsKeys } from './invalidation';

const CALLER = 'operationsMutation';

/** The `get` keys of the records the operations remove: each `remove` whose `ref` names no relationship (SPEC 16.2). */
function removedRecords(
  operations: ReadonlyArray<Operation>,
): ReadonlyArray<QueryKey> {
  return operations.flatMap(({ op, ref }) =>
    op === 'remove' && ref !== undefined && ref.relationship === undefined
      ? [[ref.type, 'get', ref.id]]
      : [],
  );
}

/** `[type]` of each type the operations write, once. */
function writtenTypes(
  operations: ReadonlyArray<Operation>,
): ReadonlyArray<QueryKey> {
  return [...new Set(operations.map(({ definition }) => definition.type))].map(
    (type) => [type],
  );
}

/**
 * The options of one Atomic Operations request through `transport`.
 * Throws `TypeError` for `invalidates` that is not a list of query keys; a
 * transport `createTransport` did not make is refused by the first
 * mutation, with the `TypeError` of `sendOperations`.
 */
export function operationsMutation<TOperation extends Operation = Operation>(
  transport: Transport,
  settings?: WriteSettings,
): OperationsOptions<TOperation> {
  const others = settingsKeys(CALLER, settings);
  return {
    mutationKey: ['operations'],
    mutationFn: async (operations) => sendOperations(transport, operations),
    onSuccess: async (_data, operations, _onMutateResult, context) => {
      for (const queryKey of removedRecords(operations)) {
        context.client.removeQueries({ queryKey });
      }
      return invalidate(context.client, [
        ...writtenTypes(operations),
        ...others,
      ]);
    },
  };
}
