/**
 * A refused write's error objects by field (resource SPEC 20.4): each object
 * whose `source.pointer` names a member the form holds, under
 * `/data/attributes/<name>` or `/data/relationships/<name>`, gives that
 * member its text, the first per member; every other object's text is the
 * form's, each distinct text once, so no refusal goes unseen. An object's
 * text is its `detail`, else its `title`, as the server localized it for the
 * request; an error that is no `ResponseError` gives nothing, since an
 * error's `message` is for logs (ADR 0014). Record and bulk actions map
 * their refusals the same way, over every member of the resource (SPEC 21.2,
 * 21.3).
 * @ref https://jsonapi.org/format/1.1/#error-objects
 * @ref https://www.rfc-editor.org/rfc/rfc6901#section-4
 * @packageDocumentation
 */
import type { ErrorObject } from '@nizam-os/jsonapi-core';

import type { FormPlan } from './form-plan';
import type { FormErrors } from './form-types';

import { isResponseError } from '@nizam-os/jsonapi-client';

import { memberAt } from './form-plan';

/** A reference token as RFC 6901 decodes it: `~1` to `/` first, then `~0` to `~`. */
function decoded(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

/**
 * The member `pointer` names, as its part and its decoded name: its first
 * reference tokens are `data`, the part, and the member's name, and any
 * after them point inside the member; `undefined` for any other pointer.
 */
export function pointedMember(
  pointer: string | undefined,
): { readonly part: string; readonly name: string } | undefined {
  if (pointer === undefined) {
    return undefined;
  }
  const [root, data, part, name] = pointer.split('/');
  return root === '' &&
    data === 'data' &&
    part !== undefined &&
    name !== undefined
    ? { part, name: decoded(name) }
    : undefined;
}

/** No refusal: what anything but a `ResponseError` gives. */
export const NO_ERRORS: FormErrors = Object.freeze({
  fields: Object.freeze({}),
  form: Object.freeze([]),
});

/**
 * The texts of `objects` by the member `memberOf` names for each, the
 * first per member; every other text, and every text without `memberOf`,
 * is the form's, each distinct text once.
 */
export function refusalTexts(
  objects: ReadonlyArray<ErrorObject>,
  memberOf?: (object: ErrorObject) => string | undefined,
): FormErrors {
  const fields: Record<string, string> = {};
  const form: Array<string> = [];
  for (const object of objects) {
    const text = object.detail ?? object.title;
    if (text === undefined) {
      continue;
    }
    const member = memberOf?.(object);
    if (member !== undefined && !Object.hasOwn(fields, member)) {
      fields[member] = text;
    } else if (!form.includes(text)) {
      form.push(text);
    }
  }
  return Object.freeze({
    fields: Object.freeze(fields),
    form: Object.freeze(form),
  });
}

/** The texts of `error`'s error objects, by the member of the form each points at. */
export function formErrors(plan: FormPlan, error: unknown): FormErrors {
  if (!isResponseError(error)) {
    return NO_ERRORS;
  }
  return refusalTexts(error.errors, (object) => {
    const at = pointedMember(object.source?.pointer);
    return at === undefined
      ? undefined
      : memberAt(plan, at.part, at.name)?.meta.name;
  });
}
