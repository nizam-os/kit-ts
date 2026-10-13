/**
 * The English texts of `defaultMessages` (SPEC 10.2): a generic detail for
 * each code no resource derives, the message of each issue kind, and labels
 * made from public names. Constant per code and kind, so no text repeats
 * request data. An issue kind's message is the English message its item
 * carries before localization (SPEC 6.4), so English output reads the same
 * either way.
 * @packageDocumentation
 */
import type { ErrorCode } from '@nizam-os/jsonapi-core';

import type { QuotaExceededCatalog } from '../errors/quota-exceeded';
import type { IssueKind } from '../schema/issue-kinds';
import type { IssueInputs, Message } from './types';

import { enumMessage, issueMessage } from '../schema/issue-messages';

/** The detail of each code of `@nizam-os/jsonapi-core` and of resource-core's own. */
export const CODE_DETAILS: Readonly<
  Record<ErrorCode | keyof QuotaExceededCatalog, string>
> = Object.freeze({
  INVALID_QUERY_PARAMETER:
    'A query parameter has a value the server cannot process.',
  UNKNOWN_QUERY_PARAMETER:
    'The server does not support a query parameter of the request.',
  INVALID_DOCUMENT: 'The request document breaks the rules of JSON:API.',
  MALFORMED_JSON: 'The request body is not valid JSON.',
  UNSUPPORTED_SORT: 'The server cannot sort by the requested fields.',
  MAX_PAGE_SIZE_EXCEEDED:
    'The requested page size is larger than the server allows.',
  RANGE_PAGINATION_NOT_SUPPORTED:
    'The server does not paginate by a range of cursors.',
  FORBIDDEN: 'The request is not allowed.',
  CLIENT_GENERATED_ID_NOT_SUPPORTED:
    'The server assigns the id of this resource.',
  NOT_FOUND: 'The resource does not exist.',
  METHOD_NOT_ALLOWED: 'The method is not allowed on this resource.',
  NOT_ACCEPTABLE:
    'The server cannot respond in a media type the request accepts.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  UNSUPPORTED_MEDIA_TYPE:
    'The request body has a media type the server does not support.',
  VALIDATION_FAILED: 'A value of the request is invalid.',
  INTERNAL_SERVER_ERROR: 'The server failed to process the request.',
  QUOTA_EXCEEDED: 'The quota for this operation is used up.',
});

/** The message of each issue kind. */
export const ISSUE_MESSAGES: {
  readonly [K in IssueKind]: Message<IssueInputs[K]>;
} = Object.freeze({
  required: () => issueMessage({ kind: 'required' }),
  type: ({ type }) => issueMessage({ kind: 'type', expected: type }),
  format: ({ format }) => issueMessage({ kind: 'format', expected: format }),
  minLength: ({ limit }) =>
    issueMessage({ kind: 'minLength', expected: limit }),
  maxLength: ({ limit }) =>
    issueMessage({ kind: 'maxLength', expected: limit }),
  minimum: ({ limit }) => issueMessage({ kind: 'minimum', expected: limit }),
  maximum: ({ limit }) => issueMessage({ kind: 'maximum', expected: limit }),
  exclusiveMinimum: ({ limit }) =>
    issueMessage({ kind: 'exclusiveMinimum', expected: limit }),
  exclusiveMaximum: ({ limit }) =>
    issueMessage({ kind: 'exclusiveMaximum', expected: limit }),
  multipleOf: ({ limit }) =>
    issueMessage({ kind: 'multipleOf', expected: limit }),
  // `values` arrives joined; an empty one is a field no value can satisfy.
  enum: ({ values }) => enumMessage(values === '' ? [] : [values]),
  pattern: () => issueMessage({ kind: 'pattern' }),
  additionalProperties: () => issueMessage({ kind: 'additionalProperties' }),
});

const SEPARATORS = /[_-]+/gu;
const WORD_START = /(?<=[\p{Ll}\p{N}])(?=\p{Lu})/gu;
const FIRST = /^./u;

/** A label made from a public name: `createdAt` is "Created at", `first_name` "First name". */
export function labelOf(name: string): string {
  const words = name
    .replace(SEPARATORS, ' ')
    .split(WORD_START)
    .join(' ')
    .toLowerCase()
    .trim();
  return words.replace(FIRST, (first) => first.toUpperCase());
}
