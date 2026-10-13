/**
 * Shared by the operations document parsers: the options and the check
 * for members a document part may not carry.
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type { OperationTarget } from './types';

import { isAtMember } from '../document/member-name';
import { pointer as toPointer } from '../internal/pointer';
import { quotable } from '../internal/quotable';
import { invalidDocument } from '../request/identifiers';

export interface ParseDocumentOptions {
  readonly maxOperations: number;
  readonly resolveHref?:
    | ((href: string) => OperationTarget | undefined)
    | undefined;
}

function member(pointer: string, name: string): string {
  return `${pointer}/${toPointer([name]).slice(1)}`;
}

export function unknownMembers(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  pointer: string,
  what: string,
  errors: Array<ErrorItem>,
): void {
  for (const name of Object.keys(value)) {
    if (!allowed.has(name) && !isAtMember(name)) {
      errors.push(
        invalidDocument(
          member(pointer, name),
          quotable(name)
            ? `"${name}" is not ${what}`
            : `This member is not ${what}`,
        ),
      );
    }
  }
}
