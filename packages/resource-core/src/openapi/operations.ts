/**
 * The path items of a declared resource (SPEC 13.1): the collection's list
 * and create, the resource's get, update, and remove, and each
 * relationship's endpoints: its relationship link's get, and update when
 * the relationship is writable on update; its related link's get when the
 * target serves get. Each operation exists only when declared, carries the
 * JSON:API media type, and answers with its documents and the error
 * responses of its codes.
 * @ref https://jsonapi.org/format/1.1/#crud
 * @ref https://jsonapi.org/format/1.1/#fetching-relationships
 * @ref https://spec.openapis.org/oas/v3.1.2.html#operation-object
 * @packageDocumentation
 */
import type { ResourcePaths } from '@nizam-os/jsonapi-core';

import type { DeclaredInternals } from '../declare/declared-resource';
import type { OperationContext, PathItem } from './operation-object';

import {
  pageDocumentSchema,
  requestDocumentSchema,
  resourceDocumentSchema,
} from './documents';
import { content, operationObject, success } from './operation-object';
import { getParameters, idParameter, listParameters } from './parameters';
import { relationshipItems } from './relationship-operations';

function collectionItem(
  internals: DeclaredInternals,
  context: OperationContext,
): PathItem {
  const { names, resource } = internals.resource;
  const operations = new Set(internals.resource.declaration.operations);
  const item: PathItem = {};
  if (operations.has('list')) {
    item.get = operationObject(internals, { kind: 'list' }, context, {
      id: 'list',
      summary: `List ${names.type}`,
      parameters: listParameters(internals),
      ok: {
        '200': success(
          `A page of ${names.type}.`,
          pageDocumentSchema(internals),
        ),
      },
    });
  }
  if (operations.has('create')) {
    item.post = operationObject(internals, { kind: 'create' }, context, {
      id: 'create',
      summary: `Create a resource of ${names.type}`,
      requestBody: {
        required: true,
        content: content(
          requestDocumentSchema(internals, 'create'),
          context.examples(names.type, 'create'),
        ),
      },
      ok: {
        '201': {
          ...success(
            'The created resource.',
            resourceDocumentSchema(internals),
          ),
          ...(resource.links.self === undefined
            ? {}
            : {
                headers: {
                  Location: {
                    description: 'The created resource’s `links.self`.',
                    schema: { type: 'string', format: 'uri-reference' },
                  },
                },
              }),
        },
      },
    });
  }
  return item;
}

function resourceItem(
  internals: DeclaredInternals,
  context: OperationContext,
): PathItem {
  const { names } = internals.resource;
  const operations = new Set(internals.resource.declaration.operations);
  const path = [idParameter(internals)];
  const item: PathItem = {};
  if (operations.has('get')) {
    item.get = operationObject(internals, { kind: 'get' }, context, {
      id: 'get',
      summary: `Get a resource of ${names.type}`,
      parameters: [...path, ...getParameters(internals)],
      ok: {
        '200': success(
          'The resource.',
          resourceDocumentSchema(internals),
          context.examples(names.type, 'get'),
        ),
      },
    });
  }
  if (operations.has('update')) {
    item.patch = operationObject(internals, { kind: 'update' }, context, {
      id: 'update',
      summary: `Update a resource of ${names.type}`,
      parameters: path,
      requestBody: {
        required: true,
        content: content(
          requestDocumentSchema(internals, 'update'),
          context.examples(names.type, 'update'),
        ),
      },
      ok: {
        '200': success(
          'The updated resource.',
          resourceDocumentSchema(internals),
        ),
      },
    });
  }
  if (operations.has('remove')) {
    item.delete = operationObject(internals, { kind: 'remove' }, context, {
      id: 'remove',
      summary: `Remove a resource of ${names.type}`,
      parameters: path,
      ok: { '204': { description: 'The resource was removed.' } },
    });
  }
  return item;
}

/** The path items of `internals`'s operations, by path. */
export function pathItems(
  internals: DeclaredInternals,
  paths: ResourcePaths,
  context: OperationContext,
): ReadonlyArray<readonly [string, PathItem]> {
  const items: Array<readonly [string, PathItem]> = [
    [paths.collection, collectionItem(internals, context)],
    [paths.resource, resourceItem(internals, context)],
    ...relationshipItems(internals, paths, context),
  ];
  return items.filter(([, item]) => Object.keys(item).length > 0);
}
