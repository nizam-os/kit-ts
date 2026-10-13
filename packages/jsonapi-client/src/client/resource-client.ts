/**
 * The calls of one resource (SPEC 15.4): each builds its URL (`urls.ts`),
 * sends through the transport, and reads the response into a result
 * (`results.ts`): records for `list`, `get`, and `related`, linkage for
 * the relationship calls, the stored record or nothing for a write.
 * `get` and `related` send `include` and `fields` alone.
 * @ref https://jsonapi.org/format/1.1/#fetching
 * @ref https://jsonapi.org/format/1.1/#crud
 * @packageDocumentation
 */
import type { AnyResource, ResourcePaths } from '@nizam-os/jsonapi-core';

import type { CallOptions, Outgoing } from '../transport/send';
import type { TransportState } from '../transport/transport';
import type { WriteInput } from './request-documents';
import type { RecordsShape } from './results';
import type { ReadResult, WriteResult } from './types';
import type { CallContext } from './urls';
import type { IncludeAndFields, WideClient } from './wide-client';
import type { LinkageInput } from './write-types';

import { serializeQuery } from '../query/serialize-query';
import { send } from '../transport/send';
import { follow } from './follow';
import {
  linkageOf,
  relationshipOf,
  resourceDocument,
} from './request-documents';
import {
  linkageResult,
  linkageWriteResult,
  recordResult,
  recordsResult,
  removeResult,
} from './results';
import { filled, relationshipPath, urlOf } from './urls';

type LinkageCall =
  | 'setRelationship'
  | 'addToRelationship'
  | 'removeFromRelationship';

const LINKAGE_METHODS = {
  setRelationship: 'PATCH',
  addToRelationship: 'POST',
  removeFromRelationship: 'DELETE',
} as const;

/** `include` and `fields` alone, as `get` and `related` send them. */
function getQuery(
  context: CallContext,
  query: IncludeAndFields,
): URLSearchParams {
  return serializeQuery(context.definition, {
    include: query.include,
    fields: query.fields,
  });
}

async function readRecords(
  context: CallContext,
  outgoing: Outgoing,
  include: ReadonlyArray<string> | undefined,
  shape: RecordsShape,
  options: CallOptions | undefined,
): Promise<ReadResult<unknown>> {
  return recordsResult(
    await send(context.state, outgoing, options),
    outgoing,
    include ?? [],
    shape,
  );
}

async function readLinkage(
  context: CallContext,
  id: string,
  name: string,
  options: CallOptions | undefined,
): Promise<ReadResult<unknown>> {
  const { cardinality } = relationshipOf(
    context.definition,
    'relationship',
    name,
  );
  const path = relationshipPath(context, 'relationship', name, 'self');
  const outgoing: Outgoing = {
    type: context.definition.type,
    call: 'relationship',
    method: 'GET',
    url: urlOf(context, filled(context, 'relationship', path, id)),
  };
  return linkageResult(
    await send(context.state, outgoing, options),
    outgoing,
    cardinality,
  );
}

async function readRelated(
  context: CallContext,
  id: string,
  name: string,
  query: IncludeAndFields,
  options: CallOptions | undefined,
): Promise<ReadResult<unknown>> {
  const { cardinality } = relationshipOf(context.definition, 'related', name);
  const path = relationshipPath(context, 'related', name, 'related');
  const outgoing: Outgoing = {
    type: context.definition.type,
    call: 'related',
    method: 'GET',
    url: urlOf(
      context,
      filled(context, 'related', path, id),
      getQuery(context, query),
    ),
  };
  return readRecords(
    context,
    outgoing,
    query.include,
    cardinality === 'one' ? 'resource or null' : 'list',
    options,
  );
}

async function writeRecord(
  context: CallContext,
  call: 'create' | 'update',
  input: WriteInput,
  id: string | undefined,
  options: CallOptions | undefined,
): Promise<WriteResult<unknown>> {
  const { paths } = context;
  const path =
    call === 'update' && id !== undefined
      ? filled(context, call, paths.resource, id)
      : paths.collection;
  const outgoing: Outgoing = {
    type: context.definition.type,
    call,
    method: call === 'create' ? 'POST' : 'PATCH',
    url: urlOf(context, path),
    document: resourceDocument(context.definition, call, input, { id }),
  };
  return recordResult(await send(context.state, outgoing, options), outgoing);
}

async function writeLinkage(
  context: CallContext,
  call: LinkageCall,
  id: string,
  name: string,
  linkage: LinkageInput,
  options: CallOptions | undefined,
): Promise<WriteResult<unknown>> {
  const relationship = relationshipOf(context.definition, call, name);
  const path = relationshipPath(context, call, name, 'self');
  const outgoing: Outgoing = {
    type: context.definition.type,
    call,
    method: LINKAGE_METHODS[call],
    url: urlOf(context, filled(context, call, path, id)),
    document: { data: linkageOf(relationship, linkage) },
  };
  return linkageWriteResult(
    await send(context.state, outgoing, options),
    outgoing,
    relationship.cardinality,
  );
}

async function remove(
  context: CallContext,
  id: string,
  options: CallOptions | undefined,
): Promise<WriteResult<unknown>> {
  const outgoing: Outgoing = {
    type: context.definition.type,
    call: 'remove',
    method: 'DELETE',
    url: urlOf(context, filled(context, 'remove', context.paths.resource, id)),
  };
  return removeResult(await send(context.state, outgoing, options));
}

/** The client of `definition`, whose operations live at `paths`, sending through `state`. */
export function resourceClient(
  definition: AnyResource,
  paths: ResourcePaths,
  state: TransportState,
): WideClient {
  const context: CallContext = { definition, paths, state };
  const { type } = definition;
  return {
    definition,
    list: async (query = {}, options) =>
      readRecords(
        context,
        {
          type,
          call: 'list',
          method: 'GET',
          url: urlOf(
            context,
            paths.collection,
            serializeQuery(definition, query),
          ),
        },
        query.include,
        'list',
        options,
      ),
    get: async (id, query = {}, options) =>
      readRecords(
        context,
        {
          type,
          call: 'get',
          method: 'GET',
          url: urlOf(
            context,
            filled(context, 'get', paths.resource, id),
            getQuery(context, query),
          ),
        },
        query.include,
        'resource',
        options,
      ),
    create: async (input, options) =>
      writeRecord(context, 'create', input, input.id, options),
    update: async (id, input, options) =>
      writeRecord(context, 'update', input, id, options),
    remove: async (id, options) => remove(context, id, options),
    relationship: async (id, name, options) =>
      readLinkage(context, id, name, options),
    related: async (id, name, query = {}, options) =>
      readRelated(context, id, name, query, options),
    setRelationship: async (id, name, linkage, options) =>
      writeLinkage(context, 'setRelationship', id, name, linkage, options),
    addToRelationship: async (id, name, linkage, options) =>
      writeLinkage(context, 'addToRelationship', id, name, linkage, options),
    removeFromRelationship: async (id, name, linkage, options) =>
      writeLinkage(
        context,
        'removeFromRelationship',
        id,
        name,
        linkage,
        options,
      ),
    next: async (result, options) => follow(context, 'next', result, options),
    prev: async (result, options) => follow(context, 'prev', result, options),
  };
}
