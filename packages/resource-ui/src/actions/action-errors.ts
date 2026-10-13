/**
 * A refused action's error objects by member (resource SPEC 21.2, 21.3). A
 * record action's map as a form's do (SPEC 20.4), over every member of the
 * resource, since a row shows every member a read returns. A selection's map
 * by the operation each object points at (jsonapi SPEC 17.3): an operation's
 * index is a position of the selection, so the object is the record's at
 * that position, and the rest of its pointer names the member as a single
 * call's would. An object that points at no record of the selection is the
 * selection's, each distinct text once.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @packageDocumentation
 */
import type { ErrorObject } from '@nizam-os/jsonapi-core';
import type { FieldMeta } from '@nizam-os/resource-core';

import type { FormErrors } from '../form/form-types';
import type { SelectionErrors } from './action-types';

import { isResponseError, operationOf } from '@nizam-os/jsonapi-client';

import { NO_ERRORS, pointedMember, refusalTexts } from '../form/form-errors';
import { partOf } from '../form/form-plan';
import { ownValue } from '../internal/object';

type Fields = Readonly<Record<string, FieldMeta>>;

/** The member of `fields` that `pointer` names under the member's part; `undefined` for any other pointer. */
function memberNamed(
  fields: Fields,
  pointer: string | undefined,
): string | undefined {
  const at = pointedMember(pointer);
  if (at === undefined) {
    return undefined;
  }
  const meta = ownValue(fields, at.name);
  return meta !== undefined && partOf(meta) === at.part ? meta.name : undefined;
}

/** A record action's refusal: `error`'s texts by the member of the resource each object points at. */
export function recordErrors(fields: Fields, error: unknown): FormErrors {
  return isResponseError(error)
    ? refusalTexts(error.errors, (object) =>
        memberNamed(fields, object.source?.pointer),
      )
    : NO_ERRORS;
}

const NO_SELECTION_ERRORS: SelectionErrors = Object.freeze({
  records: Object.freeze({}),
  form: Object.freeze([]),
});

/** The id at the position of `ids` that `object`'s operation holds; `undefined` for an object of no record. */
function recordOf(object: ErrorObject, ids: unknown): string | undefined {
  const at = operationOf(object);
  const id: unknown =
    at === undefined || !Array.isArray(ids) ? undefined : ids[at.index];
  return typeof id === 'string' ? id : undefined;
}

/** A selection's refusal: each object's text on the record of its operation and the member it names, the rest the selection's. */
export function selectionErrors(
  fields: Fields,
  error: unknown,
  ids: unknown,
): SelectionErrors {
  if (!isResponseError(error)) {
    return NO_SELECTION_ERRORS;
  }
  const byRecord = new Map<string, Array<ErrorObject>>();
  const rest: Array<ErrorObject> = [];
  for (const object of error.errors) {
    const id = recordOf(object, ids);
    if (id === undefined) {
      rest.push(object);
    } else {
      byRecord.set(id, [...(byRecord.get(id) ?? []), object]);
    }
  }
  const records = Object.fromEntries(
    [...byRecord].map(([id, objects]) => [
      id,
      refusalTexts(objects, (object) =>
        memberNamed(fields, operationOf(object)?.pointer),
      ),
    ]),
  );
  return Object.freeze({
    records: Object.freeze(records),
    form: refusalTexts(rest).form,
  });
}
