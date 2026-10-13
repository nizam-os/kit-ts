/**
 * A relationship's endpoints (SPEC 13.1), each where the definition builds
 * its link and the resource serves get: the relationship link's get, and
 * its update when the relationship is writable on update; the related
 * link's get when the target serves get too. A to-one relationship's
 * document carries the target's identifier, or `null` where the foreign
 * key may be null.
 * @ref https://jsonapi.org/format/1.1/#fetching-relationships
 * @ref https://jsonapi.org/format/1.1/#crud-updating-to-one-relationships
 * @packageDocumentation
 */
import type { ResourcePaths } from '@nizam-os/jsonapi-core';

import type { DeclaredInternals } from '../declare/declared-resource';
import type { RelationshipSpec } from '../schema/relationship-specs';
import type { OperationContext, PathItem } from './operation-object';

import { relatedDocumentSchema, relationshipDocumentSchema } from './documents';
import { content, operationObject, success } from './operation-object';
import { idParameter } from './parameters';

function selfItem(
  internals: DeclaredInternals,
  spec: RelationshipSpec,
  context: OperationContext,
): PathItem {
  const { names, declaration } = internals.resource;
  const document = relationshipDocumentSchema(
    spec.target().names.type,
    spec.nullable,
  );
  const parameters = [idParameter(internals)];
  const updates =
    declaration.operations.includes('update') && spec.access === 'readWrite';
  return {
    get: operationObject(
      internals,
      { kind: 'relationship', name: spec.name },
      context,
      {
        id: `${spec.name}.relationship.get`,
        summary: `Get the ${spec.name} relationship of a resource of ${names.type}`,
        parameters,
        ok: { '200': success('The relationship.', document) },
      },
    ),
    ...(updates
      ? {
          patch: operationObject(
            internals,
            { kind: 'relationshipUpdate', name: spec.name },
            context,
            {
              id: `${spec.name}.relationship.update`,
              summary: `Update the ${spec.name} relationship of a resource of ${names.type}`,
              parameters,
              requestBody: { required: true, content: content(document) },
              ok: { '200': success('The updated relationship.', document) },
            },
          ),
        }
      : {}),
  };
}

function relatedItem(
  internals: DeclaredInternals,
  spec: RelationshipSpec,
  context: OperationContext,
): PathItem {
  const target = spec.target();
  if (!target.declaration.operations.includes('get')) {
    return {};
  }
  return {
    get: operationObject(
      internals,
      { kind: 'related', name: spec.name },
      context,
      {
        id: `${spec.name}.related.get`,
        summary: `Get the ${spec.name} of a resource of ${internals.resource.names.type}`,
        parameters: [idParameter(internals)],
        ok: {
          '200': success(
            'The related resource.',
            relatedDocumentSchema(target.names.type, spec.nullable),
          ),
        },
      },
    ),
  };
}

/** Each relationship's path items, by path. */
export function relationshipItems(
  internals: DeclaredInternals,
  paths: ResourcePaths,
  context: OperationContext,
): ReadonlyArray<readonly [string, PathItem]> {
  if (!internals.resource.declaration.operations.includes('get')) {
    return [];
  }
  return internals.specs.relationships.flatMap((spec) => {
    const links = paths.relationships.get(spec.name);
    return [
      ...(links?.self === undefined
        ? []
        : [[links.self, selfItem(internals, spec, context)] as const]),
      ...(links?.related === undefined
        ? []
        : [[links.related, relatedItem(internals, spec, context)] as const]),
    ];
  });
}
