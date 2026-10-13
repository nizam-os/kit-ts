/**
 * The calls of one resource as the implementation types them (SPEC 15.4):
 * wide inputs, and results whose data is read and shape-checked at run
 * time. `createClients` gives them the types of `ResourceClient`.
 * @packageDocumentation
 */
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { Query } from '../query/types';
import type { CallOptions } from '../transport/send';
import type { WriteInput } from './request-documents';
import type { ReadResult, WriteResult } from './types';
import type { LinkageInput } from './write-types';

/** What `get` and `related` send. */
export type IncludeAndFields = Pick<Query, 'include' | 'fields'>;

/** The calls typed wide. */
export interface WideClient {
  readonly definition: AnyResource;
  readonly list: (
    query?: Query,
    options?: CallOptions,
  ) => Promise<ReadResult<unknown>>;
  readonly get: (
    id: string,
    query?: IncludeAndFields,
    options?: CallOptions,
  ) => Promise<ReadResult<unknown>>;
  readonly create: (
    input: WriteInput,
    options?: CallOptions,
  ) => Promise<WriteResult<unknown>>;
  readonly update: (
    id: string,
    input: WriteInput,
    options?: CallOptions,
  ) => Promise<WriteResult<unknown>>;
  readonly remove: (
    id: string,
    options?: CallOptions,
  ) => Promise<WriteResult<unknown>>;
  readonly relationship: (
    id: string,
    name: string,
    options?: CallOptions,
  ) => Promise<ReadResult<unknown>>;
  readonly related: (
    id: string,
    name: string,
    query?: IncludeAndFields,
    options?: CallOptions,
  ) => Promise<ReadResult<unknown>>;
  readonly setRelationship: (
    id: string,
    name: string,
    linkage: LinkageInput,
    options?: CallOptions,
  ) => Promise<WriteResult<unknown>>;
  readonly addToRelationship: (
    id: string,
    name: string,
    linkage: LinkageInput,
    options?: CallOptions,
  ) => Promise<WriteResult<unknown>>;
  readonly removeFromRelationship: (
    id: string,
    name: string,
    linkage: LinkageInput,
    options?: CallOptions,
  ) => Promise<WriteResult<unknown>>;
  readonly next: (
    result: { readonly links?: unknown },
    options?: CallOptions,
  ) => Promise<ReadResult<unknown> | undefined>;
  readonly prev: (
    result: { readonly links?: unknown },
    options?: CallOptions,
  ) => Promise<ReadResult<unknown> | undefined>;
}
