/**
 * The detail of one JSON:API error object (SPEC 10.4, 10.5): by its
 * item's issue kind or validator code, else by the object's own code,
 * each with the inputs of SPEC 10.3. `localizeErrors` reads it for an
 * object of a response, and `localizeIssues` for the object the server
 * makes of an issue (SPEC 9.3), so a client's own validation and the
 * server's answer read the same.
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type { Dictionary } from './dictionary';
import type { DerivedCode } from './message-index';
import type { ConstraintInputs, ErrorText } from './types';

import { ISSUE_KINDS } from '../schema/issue-kinds';
import {
  derivedType,
  fieldsFor,
  issueDetail,
  labelFor,
  memberAt,
  valuesFor,
} from './error-inputs';

/** One error object's facts. */
export interface Occurrence {
  readonly code: string;
  /** The code's texts: its own entry, else its constraint kind's for a derived code. */
  readonly text: ErrorText<ConstraintInputs> | undefined;
  readonly derived: DerivedCode | undefined;
  readonly item: ErrorItem | undefined;
  /** The type whose labels name the members. */
  readonly type: string | undefined;
}

/** A derived code's detail: its own, else its constraint kind's, with its members' labels. */
function constraintDetail(
  dictionary: Dictionary,
  code: string,
  derived: DerivedCode,
  { item, type }: Occurrence,
): string {
  const text =
    dictionary.errors.get(code) ??
    dictionary.messages.constraints[derived.kind];
  const labels = derivedType(derived, type);
  return (
    text?.detail({
      field: labelFor(dictionary, labels, memberAt(item?.path)),
      fields: fieldsFor(dictionary, derived, labels),
    }) ?? ''
  );
}

function isIssueKind(reason: string): reason is (typeof ISSUE_KINDS)[number] {
  return ISSUE_KINDS.some((kind) => kind === reason);
}

/** The detail of one object: by its item's issue kind or validator code, else by its own code. */
export function detailOf(
  dictionary: Dictionary,
  occurrence: Occurrence,
): string {
  const { code, text, derived, item, type } = occurrence;
  const reason = item?.reason;
  const member = memberAt(item?.path);
  if (reason !== undefined && isIssueKind(reason)) {
    return issueDetail(dictionary, reason, {
      field: labelFor(dictionary, type, member),
      expected: item?.expected ?? '',
      values: () => valuesFor(dictionary, type, member, item?.expected ?? ''),
    });
  }
  const validated =
    reason === undefined ? undefined : dictionary.index.derived.get(reason);
  if (reason !== undefined && validated !== undefined) {
    return constraintDetail(dictionary, reason, validated, occurrence);
  }
  if (derived !== undefined) {
    return constraintDetail(dictionary, code, derived, occurrence);
  }
  return (
    text?.detail({ field: labelFor(dictionary, type, member), fields: '' }) ??
    ''
  );
}
