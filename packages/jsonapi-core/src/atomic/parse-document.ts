/**
 * Structure of an operations document (SPEC 11.2): the top-level members,
 * each operation object, and its `ref`. Everything found wrong is reported
 * together, each error pointing into the request document.
 * @ref https://jsonapi.org/ext/atomic/#document-structure
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type { Meta } from '../document/types';
import type { ParseDocumentOptions } from './parse-support';
import type { OperationCode, OperationTarget } from './types';

import { jsonApiError } from '../errors/json-api-error';
import { hasOwnMember, isRecord, ownMember } from '../internal/object';
import { invalidDocument } from '../request/identifiers';
import { unknownMembers } from './parse-support';
import { parseTarget } from './parse-target';

export type { ParseDocumentOptions } from './parse-support';

const OPERATIONS_MEMBER = 'atomic:operations';
export const RESULTS_MEMBER = 'atomic:results';

const TOP_LEVEL_MEMBERS: ReadonlySet<string> = new Set([
  OPERATIONS_MEMBER,
  'jsonapi',
  'links',
  'meta',
]);
const OPERATION_MEMBERS: ReadonlySet<string> = new Set([
  'op',
  'ref',
  'href',
  'data',
  'meta',
]);
const OPERATION_CODES: ReadonlySet<string> = new Set([
  'add',
  'update',
  'remove',
]);

/** The member of an operation that holds its target. */
type TargetMember = 'ref' | 'href';

/** One operation as sent, with its position for pointers. */
export interface RawOperation {
  readonly index: number;
  readonly pointer: string;
  readonly op: OperationCode;
  /** From `ref`, or from `href` through the resolver. */
  readonly target: OperationTarget | undefined;
  /** The member `target` came from, which an error about the target points at. */
  readonly targetMember: TargetMember | undefined;
  readonly hasData: boolean;
  readonly data: unknown;
  readonly meta: Meta | undefined;
}

function isOperationCode(value: unknown): value is OperationCode {
  return typeof value === 'string' && OPERATION_CODES.has(value);
}

/** The member that holds `operation`'s target, when one does; both is a 400 `parseTarget` reports. */
function targetMemberOf(
  operation: Record<string, unknown>,
): TargetMember | undefined {
  if (hasOwnMember(operation, 'ref')) {
    return 'ref';
  }
  return hasOwnMember(operation, 'href') ? 'href' : undefined;
}

function parseOperation(
  value: unknown,
  index: number,
  options: ParseDocumentOptions,
  errors: Array<ErrorItem>,
): RawOperation | undefined {
  const pointer = `/${OPERATIONS_MEMBER}/${String(index)}`;
  if (!isRecord(value)) {
    errors.push(invalidDocument(pointer, 'An operation must be an object'));
    return undefined;
  }
  unknownMembers(
    value,
    OPERATION_MEMBERS,
    pointer,
    'an operation member',
    errors,
  );
  const op = ownMember(value, 'op');
  if (!isOperationCode(op)) {
    errors.push(
      invalidDocument(
        `${pointer}/op`,
        'op must be "add", "update", or "remove"',
      ),
    );
  }
  const meta = ownMember(value, 'meta');
  if (hasOwnMember(value, 'meta') && !isRecord(meta)) {
    errors.push(invalidDocument(`${pointer}/meta`, 'meta must be an object'));
  }
  const target = parseTarget(value, pointer, options, errors);
  if (!isOperationCode(op)) {
    return undefined;
  }
  return {
    index,
    pointer,
    op,
    target,
    targetMember: target === undefined ? undefined : targetMemberOf(value),
    hasData: hasOwnMember(value, 'data'),
    data: ownMember(value, 'data'),
    meta: isRecord(meta) ? meta : undefined,
  };
}

function parseOperations(
  body: Record<string, unknown>,
  options: ParseDocumentOptions,
  errors: Array<ErrorItem>,
): Array<RawOperation> {
  const operations = ownMember(body, OPERATIONS_MEMBER);
  if (!Array.isArray(operations)) {
    errors.push(
      invalidDocument(
        `/${OPERATIONS_MEMBER}`,
        `A document must contain an ${OPERATIONS_MEMBER} array`,
      ),
    );
    return [];
  }
  if (operations.length === 0) {
    errors.push(
      invalidDocument(
        `/${OPERATIONS_MEMBER}`,
        'At least one operation is required',
      ),
    );
    return [];
  }
  if (operations.length > options.maxOperations) {
    errors.push(
      invalidDocument(
        `/${OPERATIONS_MEMBER}`,
        `At most ${String(options.maxOperations)} operations are accepted per request`,
      ),
    );
    return [];
  }
  const parsed: Array<RawOperation> = [];
  operations.forEach((operation: unknown, index) => {
    const raw = parseOperation(operation, index, options, errors);
    if (raw !== undefined) {
      parsed.push(raw);
    }
  });
  return parsed;
}

/**
 * Parses the operations document, throwing a 400 `BanError` listing
 * every structural problem. The operations are returned in order with
 * their `data` untouched; `execute` parses that against the targeted
 * definition once the target is known.
 */
export function parseOperationsDocument(
  body: unknown,
  options: ParseDocumentOptions,
): Array<RawOperation> {
  if (!isRecord(body)) {
    throw jsonApiError(
      invalidDocument('', 'A JSON:API document must be a JSON object'),
    );
  }
  const errors: Array<ErrorItem> = [];
  unknownMembers(
    body,
    TOP_LEVEL_MEMBERS,
    '',
    'allowed in an operations document',
    errors,
  );
  const operations = parseOperations(body, options, errors);
  if (errors.length > 0) {
    throw jsonApiError(errors);
  }
  return operations;
}
