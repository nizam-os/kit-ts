/**
 * Relationship request documents (SPEC 9.3): the body of a `PATCH` to a
 * to-one relationship URL, and of `PATCH`, `POST`, or `DELETE` to a to-many
 * relationship URL. The body MUST contain `data`: an identifier or `null`
 * for to-one, an array of identifiers (possibly empty) for to-many.
 * @ref https://jsonapi.org/format/1.1/#crud-updating-to-one-relationships
 * @ref https://jsonapi.org/format/1.1/#crud-updating-to-many-relationships
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type { ResourceIdentifier } from '../document/types';
import type { Cardinality } from '../resource/types';

import { jsonApiError } from '../errors/json-api-error';
import { parseLinkage } from './identifiers';
import { primaryData } from './resource-document';

export interface RelationshipDocumentOptions {
  readonly cardinality: Cardinality;
  /** The related type every identifier must have. */
  readonly type: string;
}

/** `data` of a to-one relationship document: an identifier or `null`. */
export function parseToOneRelationshipDocument(
  body: unknown,
  options: Omit<RelationshipDocumentOptions, 'cardinality'>,
): ResourceIdentifier | null {
  const errors: Array<ErrorItem> = [];
  const linkage = parseLinkage(
    primaryData(body),
    '/data',
    'one',
    { type: options.type },
    errors,
  );
  if (linkage === undefined || errors.length > 0) {
    throw jsonApiError(errors);
  }
  return linkage;
}

/** `data` of a to-many relationship document: identifiers, possibly none. */
export function parseToManyRelationshipDocument(
  body: unknown,
  options: Omit<RelationshipDocumentOptions, 'cardinality'>,
): ReadonlyArray<ResourceIdentifier> {
  const errors: Array<ErrorItem> = [];
  const linkage = parseLinkage(
    primaryData(body),
    '/data',
    'many',
    { type: options.type },
    errors,
  );
  if (linkage === undefined || errors.length > 0) {
    throw jsonApiError(errors);
  }
  return linkage;
}
