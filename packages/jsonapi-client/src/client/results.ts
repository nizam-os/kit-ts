/**
 * The results of the calls (SPEC 15.4): a read's records or linkage, a
 * write's data or nothing, with the document's `links`, `meta`, and
 * `jsonapi`. Each call names the shape of its data, and a document whose
 * `data` has another one breaks the protocol and throws `TypeError`, so a
 * result's type is true: a list for `list`, one resource object for `get`.
 * A write's data is the response's when it holds `data`, and `undefined`
 * for a 202, whose document, if any, describes the request's processing
 * rather than the resource.
 * @ref https://jsonapi.org/format/1.1/#fetching-resources-responses-200
 * @ref https://jsonapi.org/format/1.1/#fetching-relationships-responses-200
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-202
 * @packageDocumentation
 */
import type { Cardinality } from '@nizam-os/jsonapi-core';

import type { AnyRecord } from '../document/types';
import type { JsonRecord } from '../internal/object';
import type { Incoming, Outgoing } from '../transport/send';
import type { IdentifierObject, ReadResult, WriteResult } from './types';

import { deserialize, documentMembers } from '../document/deserialize';
import { identifierObjectOf } from '../document/members';
import { isRecord, ownMember } from '../internal/object';
import { noDocument } from '../transport/send';

/** The shape of a read's records. */
export type RecordsShape = 'list' | 'resource' | 'resource or null';

const ACCEPTED = 202;

const SHAPE_NAMES: Readonly<Record<RecordsShape | Cardinality, string>> = {
  list: 'a list of resource objects',
  resource: 'a resource object',
  'resource or null': 'a resource object or null',
  one: 'to-one linkage',
  many: 'to-many linkage',
};

type Linkage = IdentifierObject | null | ReadonlyArray<IdentifierObject>;

function otherShape(
  outgoing: Outgoing,
  status: number,
  shape: RecordsShape | Cardinality,
): TypeError {
  return new TypeError(
    `${outgoing.type} ${outgoing.call} answered ${String(status)} with data that is not ${SHAPE_NAMES[shape]}`,
  );
}

function hasShape(data: unknown, shape: RecordsShape): boolean {
  if (shape === 'list') {
    return Array.isArray(data);
  }
  return isRecord(data) || (shape === 'resource or null' && data === null);
}

function documentOf(incoming: Incoming, outgoing: Outgoing): JsonRecord {
  if (incoming.document === undefined) {
    throw noDocument(outgoing.type, outgoing.call, incoming.status);
  }
  return incoming.document;
}

/** A document's `data` as records of `shape`, resolved along `include`. */
function recordsOf(
  document: JsonRecord,
  status: number,
  outgoing: Outgoing,
  include: ReadonlyArray<string>,
  shape: RecordsShape,
): AnyRecord | ReadonlyArray<AnyRecord> | null | undefined {
  const { data } = deserialize(document, { include });
  if (!hasShape(data, shape)) {
    throw otherShape(outgoing, status, shape);
  }
  return data;
}

/** `data` as linkage of `cardinality`; `undefined` when it is not. */
function linkageIn(
  data: unknown,
  cardinality: Cardinality,
): Linkage | undefined {
  if (cardinality === 'one') {
    return data === null ? null : identifierObjectOf(data);
  }
  if (!Array.isArray(data)) {
    return undefined;
  }
  const identifiers = data.map((item) => identifierObjectOf(item));
  return identifiers.every((identifier) => identifier !== undefined)
    ? identifiers
    : undefined;
}

/** A relationship document's `data` as linkage of `cardinality`. */
function linkageOf(
  document: JsonRecord,
  status: number,
  outgoing: Outgoing,
  cardinality: Cardinality,
): Linkage {
  const linkage = linkageIn(ownMember(document, 'data'), cardinality);
  if (linkage === undefined) {
    throw otherShape(outgoing, status, cardinality);
  }
  return linkage;
}

/** A read's records: the response must hold a document whose `data` is of `shape`. */
export function recordsResult(
  incoming: Incoming,
  outgoing: Outgoing,
  include: ReadonlyArray<string>,
  shape: RecordsShape,
): ReadResult<unknown> {
  const document = documentOf(incoming, outgoing);
  return {
    status: incoming.status,
    data: recordsOf(document, incoming.status, outgoing, include, shape),
    ...documentMembers(document),
  };
}

/** A relationship read's linkage: the response must hold a relationship document. */
export function linkageResult(
  incoming: Incoming,
  outgoing: Outgoing,
  cardinality: Cardinality,
): ReadResult<unknown> {
  const document = documentOf(incoming, outgoing);
  return {
    status: incoming.status,
    data: linkageOf(document, incoming.status, outgoing, cardinality),
    ...documentMembers(document),
  };
}

/**
 * A write's result: `read` gives the data of a response that holds
 * `data`; a 202, a 204, a response with `meta` alone, and a call without
 * `read` give `undefined`.
 */
function writeResult(
  incoming: Incoming,
  read?: (document: JsonRecord) => unknown,
): WriteResult<unknown> {
  const { status, document } = incoming;
  if (document === undefined) {
    return {
      status,
      data: undefined,
      links: undefined,
      meta: undefined,
      jsonapi: undefined,
    };
  }
  const holdsData = status !== ACCEPTED && Object.hasOwn(document, 'data');
  return {
    status,
    data: holdsData ? read?.(document) : undefined,
    ...documentMembers(document),
  };
}

/** A `create` or `update` result: the record the response holds. */
export function recordResult(
  incoming: Incoming,
  outgoing: Outgoing,
): WriteResult<unknown> {
  return writeResult(incoming, (document) =>
    recordsOf(document, incoming.status, outgoing, [], 'resource'),
  );
}

/** A relationship write's result: the linkage the response holds. */
export function linkageWriteResult(
  incoming: Incoming,
  outgoing: Outgoing,
  cardinality: Cardinality,
): WriteResult<unknown> {
  return writeResult(incoming, (document) =>
    linkageOf(document, incoming.status, outgoing, cardinality),
  );
}

/** A `remove` result: never data, the document's other members when it has one. */
export function removeResult(incoming: Incoming): WriteResult<unknown> {
  return writeResult(incoming);
}
