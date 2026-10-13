/**
 * Operation targets (SPEC 11.2): `ref`, or `href` through the endpoint's
 * resolver. An operation may carry one of them, not both.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type { ParseDocumentOptions } from './parse-support';
import type { OperationTarget } from './types';

import { hasOwnMember, isRecord, ownMember } from '../internal/object';
import { quotable } from '../internal/quotable';
import { invalidDocument } from '../request/identifiers';
import { unknownMembers } from './parse-support';

const REF_MEMBERS: ReadonlySet<string> = new Set([
  'type',
  'id',
  'lid',
  'relationship',
]);

/** `ref`: `type` with exactly one of `id` and `lid`, optionally `relationship`. */
function parseRef(
  value: unknown,
  pointer: string,
  errors: Array<ErrorItem>,
): OperationTarget | undefined {
  if (!isRecord(value)) {
    errors.push(invalidDocument(pointer, 'ref must be an object'));
    return undefined;
  }
  unknownMembers(value, REF_MEMBERS, pointer, 'a ref member', errors);
  const type = ownMember(value, 'type');
  const id = ownMember(value, 'id');
  const lid = ownMember(value, 'lid');
  const relationship = ownMember(value, 'relationship');
  const before = errors.length;
  if (typeof type !== 'string') {
    errors.push(
      invalidDocument(`${pointer}/type`, 'ref must have a string type'),
    );
  }
  if (hasOwnMember(value, 'id') && typeof id !== 'string') {
    errors.push(invalidDocument(`${pointer}/id`, 'id must be a string'));
  }
  if (hasOwnMember(value, 'lid') && typeof lid !== 'string') {
    errors.push(invalidDocument(`${pointer}/lid`, 'lid must be a string'));
  }
  if ((typeof id === 'string') === (typeof lid === 'string')) {
    errors.push(
      invalidDocument(pointer, 'ref must have exactly one of id and lid'),
    );
  }
  if (hasOwnMember(value, 'relationship') && typeof relationship !== 'string') {
    errors.push(
      invalidDocument(
        `${pointer}/relationship`,
        'relationship must be a string',
      ),
    );
  }
  if (errors.length > before || typeof type !== 'string') {
    return undefined;
  }
  return {
    type,
    id: typeof id === 'string' ? id : undefined,
    lid: typeof lid === 'string' ? lid : undefined,
    relationship: typeof relationship === 'string' ? relationship : undefined,
  };
}

function parseHref(
  value: unknown,
  pointer: string,
  options: ParseDocumentOptions,
  errors: Array<ErrorItem>,
): OperationTarget | undefined {
  if (typeof value !== 'string') {
    errors.push(invalidDocument(pointer, 'href must be a string'));
    return undefined;
  }
  if (options.resolveHref === undefined) {
    errors.push(
      invalidDocument(
        pointer,
        'This endpoint targets operations by ref, not href',
      ),
    );
    return undefined;
  }
  const target = options.resolveHref(value);
  if (target === undefined) {
    errors.push(
      invalidDocument(
        pointer,
        quotable(value)
          ? `"${value}" is not an operation target`
          : 'This href is not an operation target',
      ),
    );
  }
  return target;
}

export function parseTarget(
  operation: Record<string, unknown>,
  pointer: string,
  options: ParseDocumentOptions,
  errors: Array<ErrorItem>,
): OperationTarget | undefined {
  const hasRef = hasOwnMember(operation, 'ref');
  const hasHref = hasOwnMember(operation, 'href');
  if (hasRef && hasHref) {
    errors.push(
      invalidDocument(pointer, 'An operation may have ref or href, not both'),
    );
    return undefined;
  }
  if (hasRef) {
    return parseRef(ownMember(operation, 'ref'), `${pointer}/ref`, errors);
  }
  if (hasHref) {
    return parseHref(
      ownMember(operation, 'href'),
      `${pointer}/href`,
      options,
      errors,
    );
  }
  return undefined;
}
