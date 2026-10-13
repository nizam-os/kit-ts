/**
 * The Atomic Operations endpoint (SPEC 13.1): `POST <base>/operations`, the
 * operations path of the resources' links (jsonapi SPEC 5.4), which a host
 * serves when a listed resource declares a write (SPEC 19.4), listed under
 * the operation id and tag `atomic:operations`, which no resource's
 * operation can take: a type is a JSON:API member name, which holds no `:`.
 * Its request is an operations document of the extension's media type
 * (`atomic-requests.ts`), whose resource objects are the components this
 * module adds per resource. It answers 200 with `atomic:results` when an
 * operation can carry a resource object back, 204 when a result can be
 * empty, and the error responses of every code an operation can raise.
 * @ref https://jsonapi.org/ext/atomic/
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @ref https://jsonapi.org/ext/atomic/#result-objects
 * @ref https://jsonapi.org/format/1.1/#document-member-names-allowed-characters
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';
import type {
  ReferenceObject,
  ResponseObject,
} from '@nizam-os/ban-core/openapi';

import type { DeclaredInternals } from '../declare/declared-resource';
import type { OperationObject } from './operation-object';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  formatJsonApiMediaType,
} from '@nizam-os/jsonapi-core';

import { declares, requestDocumentSchema } from './atomic-requests';
import { schemaKey, schemaRef } from './component-names';
import { TOP_LEVEL } from './documents';
import { localIdentifierSchema, requestObjectSchema } from './resource-schemas';

/** The extension's member, the endpoint's operation id, and its tag. */
const OPERATIONS = 'atomic:operations';
/** The media type of an operations request and of its results (jsonapi SPEC 11.1). */
const ATOMIC_MEDIA_TYPE = formatJsonApiMediaType({
  ext: [ATOMIC_OPERATIONS_EXTENSION],
});
const WRITES: ReadonlySet<string> = new Set(['create', 'update', 'remove']);
const META: JsonSchema = { type: 'object' };

/** Whether a host serves the endpoint for `listed`: a resource declares a write. */
export function servesOperations(
  listed: ReadonlyArray<DeclaredInternals>,
): boolean {
  return listed.some((internals) =>
    internals.resource.declaration.operations.some((operation) =>
      WRITES.has(operation),
    ),
  );
}

/** The types whose lids an operation may name: the ones an `add` creates. */
export function lidTypes(
  listed: ReadonlyArray<DeclaredInternals>,
): ReadonlySet<string> {
  return new Set(
    listed
      .filter((internals) => declares(internals, 'create'))
      .map((internals) => internals.resource.names.type),
  );
}

/** The component schemas an operation of the resource reads: its local identifier, and the resource objects of its `add` and its `update`. */
export function atomicSchemas(
  internals: DeclaredInternals,
  lids: ReadonlySet<string>,
): ReadonlyArray<readonly [string, JsonSchema]> {
  const { type } = internals.resource.names;
  const creates = declares(internals, 'create');
  return [
    ...(creates
      ? [
          [schemaKey(type, 'local'), localIdentifierSchema(internals)] as const,
          [
            schemaKey(type, 'atomic-add'),
            requestObjectSchema(internals, 'create', lids),
          ] as const,
        ]
      : []),
    ...(declares(internals, 'update')
      ? [
          [
            schemaKey(type, 'atomic-update'),
            requestObjectSchema(internals, 'update', lids),
          ] as const,
        ]
      : []),
  ];
}

/** The operations path the resources' links give (`resourcePaths`, jsonapi SPEC 5.4); a `TypeError` when they give more than one. */
export function operationsPath(paths: ReadonlyArray<string>): string {
  const distinct = [...new Set(paths)];
  const [path] = distinct;
  if (path === undefined || distinct.length > 1) {
    throw new TypeError(
      `openapi: the resources' links have different operations paths (${distinct.join(', ')}); one endpoint has one path`,
    );
  }
  return path;
}

/** The results document: a result carries the resource object of an `add` or an `update`, and is empty otherwise. */
function resultsDocumentSchema(
  listed: ReadonlyArray<DeclaredInternals>,
): JsonSchema | undefined {
  const objects = listed
    .filter(
      (internals) =>
        declares(internals, 'create') || declares(internals, 'update'),
    )
    .map((internals) => schemaRef(internals.resource.names.type, 'resource'));
  const [only] = objects;
  if (only === undefined) {
    return undefined;
  }
  return {
    type: 'object',
    properties: {
      ...TOP_LEVEL,
      'atomic:results': {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            data: objects.length === 1 ? only : { anyOf: objects },
            meta: META,
          },
        },
      },
    },
    required: ['atomic:results'],
  };
}

/** Whether a result can be empty: a `remove`, or an update of a relationship. */
function emptyResults(listed: ReadonlyArray<DeclaredInternals>): boolean {
  return listed.some(
    (internals) =>
      declares(internals, 'remove') ||
      (declares(internals, 'update') &&
        internals.specs.relationships.some(
          (spec) => spec.access === 'readWrite',
        )),
  );
}

/** The endpoint's operation, its error responses `errors`. */
export function atomicOperation(
  listed: ReadonlyArray<DeclaredInternals>,
  errors: Readonly<Record<string, ResponseObject | ReferenceObject>>,
): OperationObject {
  const lids = lidTypes(listed);
  const results = resultsDocumentSchema(listed);
  return {
    operationId: OPERATIONS,
    summary: 'Run operations atomically: every one commits, or none does',
    tags: [OPERATIONS],
    requestBody: {
      required: true,
      content: {
        [ATOMIC_MEDIA_TYPE]: { schema: requestDocumentSchema(listed, lids) },
      },
    },
    responses: {
      ...(results === undefined
        ? {}
        : {
            '200': {
              description: 'Every operation ran; their results, in order.',
              content: { [ATOMIC_MEDIA_TYPE]: { schema: results } },
            },
          }),
      ...(emptyResults(listed)
        ? {
            '204': {
              description: 'Every operation ran, and none has a result.',
            },
          }
        : {}),
      ...errors,
    },
  };
}
