/**
 * `operationsOf(definition)` (SPEC 17.1): the operations of one
 * definition, as frozen values that a model holds and one request sends
 * together. Each builder takes what the call of its name takes (SPEC 15.4)
 * and holds what that call would send: a create's and an update's
 * resource object, the update naming its target by the object's `type`
 * and `id` as the extension's example does; a removal's `ref`; and a
 * relationship operation's linkage, under a `ref` that names the
 * relationship. A relationship value may be a local identifier,
 * `{ type, lid }`, naming what an earlier operation of the request
 * creates. A relationship the definition does not declare throws
 * `TypeError` naming it; anything else is the server's to refuse, in one
 * 400 for the whole request.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @ref https://jsonapi.org/ext/atomic/#auto-id-updating-resources (the operation names its target by `data` alone)
 * @ref https://jsonapi.org/ext/atomic/#auto-id-deleting-resources
 * @ref https://jsonapi.org/ext/atomic/#auto-id-updating-to-many-relationships
 * @packageDocumentation
 */
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { AnyLinkageInput, WriteInput } from '../client/request-documents';
import type {
  Operation,
  OperationBuilders,
  OperationCode,
  OperationRef,
} from './types';

import {
  linkageOf,
  relationshipOf,
  resourceDocument,
} from '../client/request-documents';

type RelationshipCall =
  | 'setRelationship'
  | 'addToRelationship'
  | 'removeFromRelationship';

/** Each relationship write's `op`, as the extension names it. */
const RELATIONSHIP_OPS: Readonly<Record<RelationshipCall, OperationCode>> = {
  setRelationship: 'update',
  addToRelationship: 'add',
  removeFromRelationship: 'remove',
};

/** The builders typed wide, as the implementation holds them. */
interface WideBuilders {
  readonly create: (
    input: WriteInput & { readonly lid?: string | undefined },
  ) => Operation;
  readonly update: (id: string, input: WriteInput) => Operation;
  readonly remove: (id: string) => Operation;
  readonly setRelationship: RelationshipBuilder;
  readonly addToRelationship: RelationshipBuilder;
  readonly removeFromRelationship: RelationshipBuilder;
}

type RelationshipBuilder = (
  id: string,
  name: string,
  linkage: AnyLinkageInput,
) => Operation;

function operation(
  definition: AnyResource,
  op: OperationCode,
  ref: OperationRef | undefined,
  data?: unknown,
): Operation {
  return Object.freeze({
    definition,
    op,
    ref: ref === undefined ? undefined : Object.freeze(ref),
    data,
  });
}

function relationshipBuilder(
  definition: AnyResource,
  call: RelationshipCall,
): RelationshipBuilder {
  return (id, name, linkage) =>
    operation(
      definition,
      RELATIONSHIP_OPS[call],
      { type: definition.type, id, relationship: name },
      linkageOf(relationshipOf(definition, call, name), linkage),
    );
}

/** The operations of `definition`; nothing is sent until `sendOperations` sends them. */
export function operationsOf<TDefinition extends AnyResource>(
  definition: TDefinition,
): OperationBuilders<TDefinition> {
  const builders: WideBuilders = {
    create: (input) =>
      operation(
        definition,
        'add',
        undefined,
        resourceDocument(definition, 'create', input, {
          id: input.id,
          lid: input.lid,
        }).data,
      ),
    update: (id, input) =>
      operation(
        definition,
        'update',
        undefined,
        resourceDocument(definition, 'update', input, { id }).data,
      ),
    remove: (id) =>
      operation(definition, 'remove', { type: definition.type, id }),
    setRelationship: relationshipBuilder(definition, 'setRelationship'),
    addToRelationship: relationshipBuilder(definition, 'addToRelationship'),
    removeFromRelationship: relationshipBuilder(
      definition,
      'removeFromRelationship',
    ),
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: one set of wide builders serves every definition; `OperationBuilders` types their inputs by the definition passed and their results by the records the server serializes with it (ADR 0017), which `sendOperations` holds to each operation's shape at run time
  return builders as unknown as OperationBuilders<TDefinition>;
}
