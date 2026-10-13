/**
 * Resource identifier objects and linkage in request documents (SPEC 9.1).
 * `type`, `id`, and `lid` MUST be strings; `lid` identifies a resource
 * created earlier in the same document and is accepted only where the
 * caller says so (atomic operations).
 * @ref https://jsonapi.org/format/1.1/#document-resource-identifier-objects
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-linkage
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type {
  AnyResourceIdentifier,
  ResourceIdentifier,
  ResourceLinkage,
} from '../document/types';
import type { Cardinality } from '../resource/types';

import { errorItem } from '../errors/json-api-error';
import { hasOwnMember, isRecord, ownMember } from '../internal/object';
import { quotable } from '../internal/quotable';

/** Linkage a request may carry: identifiers that may use `lid`. */
export type RequestLinkage =
  | null
  | AnyResourceIdentifier
  | ReadonlyArray<AnyResourceIdentifier>;

export interface IdentifierOptions {
  /** Accept `lid` in place of `id`. Default false. */
  readonly lids?: boolean | undefined;
  /** The type the identifier must have; a mismatch is a 409. */
  readonly type?: string | undefined;
}

export function invalidDocument(pointer: string, detail: string): ErrorItem {
  return errorItem('INVALID_DOCUMENT', { detail, source: { pointer } });
}

export function conflict(pointer: string, detail: string): ErrorItem {
  return errorItem('CONFLICT', { detail, source: { pointer } });
}

/**
 * Parses one identifier object at `pointer`, pushing errors and returning
 * `undefined` when it is not one.
 */
export function parseIdentifier(
  value: unknown,
  pointer: string,
  options: IdentifierOptions & { readonly lids?: false | undefined },
  errors: Array<ErrorItem>,
): ResourceIdentifier | undefined;
export function parseIdentifier(
  value: unknown,
  pointer: string,
  options: IdentifierOptions,
  errors: Array<ErrorItem>,
): AnyResourceIdentifier | undefined;
export function parseIdentifier(
  value: unknown,
  pointer: string,
  options: IdentifierOptions,
  errors: Array<ErrorItem>,
): AnyResourceIdentifier | undefined {
  if (!isRecord(value)) {
    errors.push(
      invalidDocument(
        pointer,
        'A resource identifier object must be an object',
      ),
    );
    return undefined;
  }
  const type = ownMember(value, 'type');
  const id = ownMember(value, 'id');
  const lid = ownMember(value, 'lid');
  if (typeof type !== 'string') {
    errors.push(
      invalidDocument(
        `${pointer}/type`,
        'A resource identifier object must have a string type',
      ),
    );
    return undefined;
  }
  if (options.type !== undefined && type !== options.type) {
    errors.push(
      conflict(
        `${pointer}/type`,
        quotable(type)
          ? `Expected a resource of type "${options.type}", received "${type}"`
          : `Expected a resource of type "${options.type}"`,
      ),
    );
    return undefined;
  }
  const meta = ownMember(value, 'meta');
  if (meta !== undefined && !isRecord(meta)) {
    errors.push(invalidDocument(`${pointer}/meta`, 'meta must be an object'));
    return undefined;
  }
  if (typeof id === 'string') {
    return meta === undefined ? { type, id } : { type, id, meta };
  }
  if (hasOwnMember(value, 'id')) {
    errors.push(invalidDocument(`${pointer}/id`, 'id must be a string'));
    return undefined;
  }
  if (typeof lid === 'string' && options.lids === true) {
    return meta === undefined ? { type, lid } : { type, lid, meta };
  }
  errors.push(
    invalidDocument(
      pointer,
      options.lids === true
        ? 'A resource identifier object must have a string id or lid'
        : 'A resource identifier object must have a string id',
    ),
  );
  return undefined;
}

/**
 * Parses linkage at `pointer` for the given cardinality: to-one accepts an
 * identifier or `null`; to-many accepts an array of identifiers, possibly
 * empty. Returns `undefined` after pushing errors.
 */
export function parseLinkage(
  value: unknown,
  pointer: string,
  cardinality: 'one',
  options: IdentifierOptions & { readonly lids?: false | undefined },
  errors: Array<ErrorItem>,
): ResourceIdentifier | null | undefined;
export function parseLinkage(
  value: unknown,
  pointer: string,
  cardinality: 'many',
  options: IdentifierOptions & { readonly lids?: false | undefined },
  errors: Array<ErrorItem>,
): ReadonlyArray<ResourceIdentifier> | undefined;
export function parseLinkage(
  value: unknown,
  pointer: string,
  cardinality: Cardinality,
  options: IdentifierOptions & { readonly lids?: false | undefined },
  errors: Array<ErrorItem>,
): ResourceLinkage | undefined;
export function parseLinkage(
  value: unknown,
  pointer: string,
  cardinality: 'one',
  options: IdentifierOptions,
  errors: Array<ErrorItem>,
): AnyResourceIdentifier | null | undefined;
export function parseLinkage(
  value: unknown,
  pointer: string,
  cardinality: 'many',
  options: IdentifierOptions,
  errors: Array<ErrorItem>,
): ReadonlyArray<AnyResourceIdentifier> | undefined;
export function parseLinkage(
  value: unknown,
  pointer: string,
  cardinality: Cardinality,
  options: IdentifierOptions,
  errors: Array<ErrorItem>,
): RequestLinkage | undefined;
export function parseLinkage(
  value: unknown,
  pointer: string,
  cardinality: Cardinality,
  options: IdentifierOptions,
  errors: Array<ErrorItem>,
): RequestLinkage | undefined {
  if (cardinality === 'one') {
    if (value === null) {
      return null;
    }
    if (Array.isArray(value)) {
      errors.push(
        invalidDocument(
          pointer,
          'A to-one relationship takes a resource identifier object or null',
        ),
      );
      return undefined;
    }
    return parseIdentifier(value, pointer, options, errors);
  }
  if (!Array.isArray(value)) {
    errors.push(
      invalidDocument(
        pointer,
        'A to-many relationship takes an array of resource identifier objects',
      ),
    );
    return undefined;
  }
  const identifiers: Array<AnyResourceIdentifier> = [];
  const before = errors.length;
  for (const [index, item] of value.entries()) {
    const identifier = parseIdentifier(
      item,
      `${pointer}/${String(index)}`,
      options,
      errors,
    );
    if (identifier !== undefined) {
      identifiers.push(identifier);
    }
  }
  return errors.length === before ? identifiers : undefined;
}
