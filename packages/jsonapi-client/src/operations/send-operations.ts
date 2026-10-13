/**
 * `sendOperations(transport, operations, options?)` (SPEC 17.2, ADR 0022):
 * every operation in one `POST` to the operations path of their
 * definitions' links, under the extension's media type, so they commit
 * together or not at all. The transport, the list, its operations, and
 * their one path are checked before anything is sent; the cap is not,
 * since the server answers a request over it with its 400, and the
 * definitions carry it for the screens. The response is read into a
 * result per operation (`operation-results.ts`); any other status rejects
 * with `ResponseError`, its `type` the operations' types and its `call`
 * `operations`.
 * @ref https://jsonapi.org/ext/atomic/#processing ("All HTTP requests sent with this extension MUST be issued with POST")
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-clients
 * @packageDocumentation
 */
import type {
  AppliedExtension,
  CallOptions,
  Outgoing,
} from '../transport/send';
import type { Operation, OperationsResult } from './types';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  resourcePaths,
} from '@nizam-os/jsonapi-core';

import { isRecord, ownMember } from '../internal/object';
import { send } from '../transport/send';
import { Transport } from '../transport/transport';
import { operationsResult } from './operation-results';

const CALLER = 'sendOperations';
const OPS: ReadonlySet<unknown> = new Set(['add', 'update', 'remove']);
const ATOMIC: AppliedExtension = {
  uri: ATOMIC_OPERATIONS_EXTENSION,
  members: ['atomic:results'],
};

/** An operation by its shape: a definition with a string `type`, and an `op` of the extension's. */
function isOperation(value: unknown): value is Operation {
  if (!isRecord(value)) {
    return false;
  }
  const definition = ownMember(value, 'definition');
  return (
    isRecord(definition) &&
    typeof ownMember(definition, 'type') === 'string' &&
    OPS.has(ownMember(value, 'op'))
  );
}

/** `value` as a non-empty list of operations; `TypeError` naming the index of the first that is none. */
function operationList(value: unknown): ReadonlyArray<Operation> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      `${CALLER}: operations must be a non-empty list of operations`,
    );
  }
  const list: ReadonlyArray<unknown> = value;
  const index = list.findIndex((item) => !isOperation(item));
  if (index !== -1) {
    throw new TypeError(
      `${CALLER}: operations[${String(index)}] is not an operation of operationsOf`,
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: every element passed `isOperation` just above; `findIndex` does not narrow the list
  return list as ReadonlyArray<Operation>;
}

/** The operations path every operation's definition names; `TypeError` when they name more than one. */
function operationsPath(operations: ReadonlyArray<Operation>): string {
  const paths = [
    ...new Set(
      operations.map(
        ({ definition }) =>
          resourcePaths(definition, { caller: CALLER }).operations,
      ),
    ),
  ];
  const [path] = paths;
  if (path === undefined || paths.length > 1) {
    throw new TypeError(
      `${CALLER}: the operations' definitions name different operations paths (${paths.join(', ')}); one request reaches one endpoint`,
    );
  }
  return path;
}

/** The extension's operation object: `op`, and `ref` and `data` where the operation has them. */
function operationObject(operation: Operation): object {
  return {
    op: operation.op,
    ...(operation.ref === undefined ? {} : { ref: operation.ref }),
    ...(operation.data === undefined ? {} : { data: operation.data }),
  };
}

/**
 * Sends `operations` in one request and resolves to their results, typed
 * per operation. Throws `TypeError` before sending for a transport
 * `createTransport` did not make, an empty list, a value that is not an
 * operation, and operations whose definitions name different operations
 * paths; rejects with `ResponseError` for a refusal, whose error objects
 * `operationOf` maps to the operations sent.
 */
export async function sendOperations<
  const TOperations extends ReadonlyArray<Operation>,
>(
  transport: Transport,
  operations: TOperations,
  options?: CallOptions,
): Promise<OperationsResult<TOperations>> {
  const state = Transport.stateOf(transport, CALLER);
  const list = operationList(operations);
  const path = operationsPath(list);
  const outgoing: Outgoing = {
    type: [...new Set(list.map(({ definition }) => definition.type))].join(
      ', ',
    ),
    call: 'operations',
    method: 'POST',
    url: `${state.origin}${path}`,
    document: {
      'atomic:operations': list.map((operation) => operationObject(operation)),
    },
    extension: ATOMIC,
  };
  const result = operationsResult(
    await send(state, outgoing, options),
    outgoing,
    list,
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: each result was read for the operation at its index and held to that operation's shape; the records are typed by the definitions the server serializes with (ADR 0017)
  return result as unknown as OperationsResult<TOperations>;
}
