/**
 * The members of a request resource object (SPEC 9.2): identity (`type`,
 * `id`, `lid`), attribute names, and relationships. Each parser pushes
 * error objects with pointers and returns what it understood, so one 400
 * reports every problem.
 * @ref https://jsonapi.org/format/1.1/#crud-creating
 * @ref https://jsonapi.org/format/1.1/#crud-creating-client-ids
 * @ref https://jsonapi.org/format/1.1/#crud-updating
 * @ref https://jsonapi.org/format/1.1/#crud-updating-resource-relationships
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type { StandardSchema } from '../internal/standard-schema-types';
import type { AnyResource } from '../resource/types';
import type { RequestLinkage } from './identifiers';
import type { Operation, ParseResourceOptions } from './types';

import { isAtMember } from '../document/member-name';
import { errorItem } from '../errors/json-api-error';
import {
  hasOwnMember,
  isRecord,
  ownEntry,
  ownMember,
} from '../internal/object';
import { pointer as toPointer } from '../internal/pointer';
import { quotable } from '../internal/quotable';
import { conflict, invalidDocument, parseLinkage } from './identifiers';

export const RESOURCE_MEMBERS: ReadonlySet<string> = new Set([
  'type',
  'id',
  'lid',
  'attributes',
  'relationships',
  'links',
  'meta',
]);

interface Identity {
  readonly id: string | undefined;
  readonly lid: string | undefined;
}

/** `type` must equal the definition's; `id` and `lid` follow the operation. */
export function parseIdentity(
  resource: AnyResource,
  data: Record<string, unknown>,
  options: ParseResourceOptions,
  pointer: string,
  errors: Array<ErrorItem>,
): Identity {
  const type = ownMember(data, 'type');
  if (typeof type !== 'string') {
    errors.push(
      invalidDocument(
        `${pointer}/type`,
        'A resource object must have a string type',
      ),
    );
  } else if (type !== resource.type) {
    errors.push(
      conflict(
        `${pointer}/type`,
        quotable(type)
          ? `This endpoint accepts resources of type "${resource.type}", received "${type}"`
          : `This endpoint accepts resources of type "${resource.type}"`,
      ),
    );
  }
  const id = ownMember(data, 'id');
  const lid = ownMember(data, 'lid');
  if (hasOwnMember(data, 'id') && typeof id !== 'string') {
    errors.push(invalidDocument(`${pointer}/id`, 'id must be a string'));
  }
  if (
    hasOwnMember(data, 'lid') &&
    (typeof lid !== 'string' || options.lids !== true)
  ) {
    errors.push(
      invalidDocument(
        `${pointer}/lid`,
        options.lids === true
          ? 'lid must be a string'
          : 'lid is not accepted here',
      ),
    );
  }
  if (options.operation === 'create') {
    if (typeof id === 'string' && !resource.clientIds) {
      errors.push(
        errorItem('CLIENT_GENERATED_ID_NOT_SUPPORTED', {
          detail: `"${resource.type}" does not accept client-generated ids`,
          source: { pointer: `${pointer}/id` },
        }),
      );
    }
  } else if (
    typeof id !== 'string' &&
    !(options.lids === true && typeof lid === 'string')
  ) {
    errors.push(
      invalidDocument(
        `${pointer}/id`,
        'An update must identify the resource with a string id',
      ),
    );
  }
  return {
    id: typeof id === 'string' ? id : undefined,
    lid: typeof lid === 'string' ? lid : undefined,
  };
}

/**
 * Whether an update's id names the resource the request's id names: the
 * same text, or two texts `schema` takes with one output, the server's
 * spelling of the key. JSON:API answers 409 for an id that does not match
 * the endpoint; a server that takes a key in more than one spelling, as a
 * UUID's hex digits in either case, names the resource in each, so a
 * client that requests the key in its own spelling and repeats the
 * server's is no conflict.
 * @ref https://jsonapi.org/format/1.1/#crud-updating-responses-409
 * @ref https://www.rfc-editor.org/rfc/rfc9562#section-4
 */
async function sameResource(
  schema: StandardSchema<unknown, string> | undefined,
  id: string,
  requested: string,
): Promise<boolean> {
  if (id === requested || schema === undefined) {
    return id === requested;
  }
  const [mine, theirs] = await Promise.all([
    schema['~standard'].validate(id),
    schema['~standard'].validate(requested),
  ]);
  return (
    mine.issues === undefined &&
    theirs.issues === undefined &&
    mine.value === theirs.value
  );
}

/**
 * A 409 for an update whose id names another resource than the request's
 * (`options.id`), as `validate.id` tells them apart.
 */
export async function idConflict(
  resource: AnyResource,
  id: string | undefined,
  options: ParseResourceOptions,
  pointer: string,
): Promise<ErrorItem | undefined> {
  const requested = options.id;
  if (
    options.operation === 'create' ||
    id === undefined ||
    requested === undefined ||
    (await sameResource(resource.validate.id, id, requested))
  ) {
    return undefined;
  }
  return conflict(
    `${pointer}/id`,
    quotable(id) && quotable(requested)
      ? `The document's id "${id}" does not match the request's id "${requested}"`
      : "The document's id does not match the request's id",
  );
}

/**
 * A 403 for a declared field the operation does not write (the definition's
 * `writable`), so the field never reaches the validator.
 * @ref https://jsonapi.org/format/1.1/#crud-updating-relationship-responses-403 (the update's 403, which the page anchors under this id)
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-403
 */
function notWritable(
  resource: AnyResource,
  operation: Operation,
  name: string,
  at: string,
): ErrorItem {
  return errorItem('FORBIDDEN', {
    detail: `"${resource.type}" does not accept "${name}" on ${operation}`,
    source: { pointer: at },
  });
}

export function parseRelationships(
  resource: AnyResource,
  value: unknown,
  options: ParseResourceOptions,
  pointer: string,
  errors: Array<ErrorItem>,
): Record<string, RequestLinkage> {
  const out: Record<string, RequestLinkage> = {};
  if (value === undefined) {
    return out;
  }
  if (!isRecord(value)) {
    errors.push(invalidDocument(pointer, 'relationships must be an object'));
    return out;
  }
  for (const [name, relationship] of Object.entries(value)) {
    const definition = ownEntry(resource.relationships, name);
    const at = `${pointer}/${toPointer([name]).slice(1)}`;
    if (isAtMember(name)) {
      continue;
    }
    if (definition === undefined) {
      errors.push(
        invalidDocument(
          at,
          quotable(name)
            ? `"${resource.type}" has no relationship "${name}"`
            : `"${resource.type}" has no relationship by this name`,
        ),
      );
      continue;
    }
    if (!resource.writable[options.operation].has(name)) {
      errors.push(notWritable(resource, options.operation, name, at));
      continue;
    }
    if (!isRecord(relationship) || !hasOwnMember(relationship, 'data')) {
      errors.push(
        invalidDocument(
          at,
          'A relationship in a request must be a relationship object with a data member',
        ),
      );
      continue;
    }
    const linkage = parseLinkage(
      ownMember(relationship, 'data'),
      `${at}/data`,
      definition.cardinality,
      { lids: options.lids, type: definition.type },
      errors,
    );
    if (linkage !== undefined) {
      out[name] = linkage;
    }
  }
  return out;
}

/** Attribute names must be declared and written by the operation; values are checked by the validator. */
export function parseAttributeNames(
  resource: AnyResource,
  value: unknown,
  operation: Operation,
  pointer: string,
  errors: Array<ErrorItem>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (value === undefined) {
    return out;
  }
  if (!isRecord(value)) {
    errors.push(invalidDocument(pointer, 'attributes must be an object'));
    return out;
  }
  for (const [name, attribute] of Object.entries(value)) {
    if (isAtMember(name)) {
      continue;
    }
    const at = `${pointer}/${toPointer([name]).slice(1)}`;
    if (!resource.attributes.includes(name)) {
      errors.push(
        invalidDocument(
          at,
          quotable(name)
            ? `"${resource.type}" has no attribute "${name}"`
            : `"${resource.type}" has no attribute by this name`,
        ),
      );
      continue;
    }
    if (!resource.writable[operation].has(name)) {
      errors.push(notWritable(resource, operation, name, at));
      continue;
    }
    out[name] = attribute;
  }
  return out;
}
