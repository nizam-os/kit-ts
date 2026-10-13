/**
 * `bindResponseErrors(form, model, error)` (resource SPEC 20.5, ADR 0017):
 * a refused write's texts on the fields of a TanStack Form, each in the
 * slot of the field's `errorMap` that TanStack Form clears once the person
 * may have answered it. A text the response gives one field is that
 * field's `onSubmit` error, which outlasts other fields' changes and goes
 * when the field changes or loses focus. Texts it gives several fields are
 * their `onServer` errors, which the form's validation clears when any
 * field changes or loses focus: a refusal of several members together,
 * as a unique constraint, an exclusion constraint, or a CHECK over several
 * columns makes, is answered by changing any one of them. Either error
 * blocks a submit until it goes, so the values the server refused are not
 * sent again unchanged. A held member the form has no field for gives its
 * text to the form's, so no refusal goes unseen, and each binding replaces
 * the texts the one before it set, leaving every other error be.
 * @ref https://tanstack.com/form/v1/docs/framework/react/guides/validation
 * @ref https://tanstack.com/form/v1/docs/reference/classes/FormApi
 * @packageDocumentation
 */
import type { AnyFormApi } from '@tanstack/form-core';

import type { FormErrors, FormModel } from '@nizam-os/resource-ui';

import { checkModel } from './form-model';
import { isObject } from './internal/object';

const CALLER = 'bindResponseErrors';

/** The methods of a `FormApi` the binding calls. */
const FORM_METHODS: ReadonlyArray<string> = ['getFieldMeta', 'setFieldMeta'];

/**
 * What the binding takes of a TanStack Form `FormApi`: its values, which
 * tie the form to the model it was made from, and the methods that read
 * and set a field's meta. Every `FormApi` is one, whatever its validators
 * and submit meta; TanStack Form's own `AnyFormApi` is not a parameter
 * every form passes for, since its type parameters are invariant and a
 * form without `onSubmitMeta` has the submit meta `never`.
 */
export interface BindableForm<TValues> {
  readonly state: { readonly values: TValues };
  readonly getFieldMeta: (field: never) => unknown;
  readonly setFieldMeta: (field: never, updater: never) => void;
}

/** A server's text as a field holds it: an object with a `message`, as a validator's issue is. */
interface ServerText {
  readonly message: string;
}

/** The slots of a field's `errorMap` a server's text goes into. */
type Slot = 'onSubmit' | 'onServer';

const SLOTS: ReadonlyArray<Slot> = ['onSubmit', 'onServer'];

/** The texts this module set, so a binding clears those of the last one and no other error. */
const BOUND = new WeakSet<object>();

/** Throws a `TypeError` when `form` lacks a method the binding calls. */
function checkForm(form: unknown): void {
  if (
    !isObject(form) ||
    FORM_METHODS.some(
      (method) => typeof Reflect.get(form, method) !== 'function',
    )
  ) {
    throw new TypeError(`${CALLER}: form must be a TanStack Form FormApi`);
  }
}

/** Clears the text an earlier binding left on `name`'s field, in either slot. */
function clearBound(form: AnyFormApi, name: string): void {
  const meta = form.getFieldMeta(name);
  for (const slot of SLOTS) {
    const held: unknown = meta?.errorMap[slot];
    if (isObject(held) && BOUND.has(held)) {
      form.setFieldMeta(name, (previous) => ({
        ...previous,
        errorMap: { ...previous.errorMap, [slot]: undefined },
        errorSourceMap: { ...previous.errorSourceMap, [slot]: undefined },
      }));
    }
  }
}

/** Sets `message` as `name`'s error in `slot`, from the form, and marks the field touched, so a field that shows its errors once touched shows it. */
function bindText(
  form: AnyFormApi,
  name: string,
  slot: Slot,
  message: string,
): void {
  const text: ServerText = Object.freeze({ message });
  BOUND.add(text);
  form.setFieldMeta(name, (previous) => ({
    ...previous,
    isTouched: true,
    errorMap: { ...previous.errorMap, [slot]: text },
    errorSourceMap: { ...previous.errorSourceMap, [slot]: 'form' as const },
  }));
}

/**
 * Binds the texts of `error`, a write the server refused, onto the fields of
 * `form`, replacing those the last binding set, and returns them: the text
 * of each field it bound, and the texts no field holds, for a banner. `form`
 * is a TanStack Form `FormApi` made from `resourceFormOptions(model)`: the
 * `formApi` a submit handler receives, or the form an adapter made, Lit's as
 * `controller.api`. An error that is no `ResponseError` binds nothing.
 * Throws `TypeError` for a form or a model a JavaScript caller got wrong.
 */
export function bindResponseErrors<TValues extends object>(
  form: BindableForm<TValues>,
  model: FormModel<TValues, unknown>,
  error: unknown,
): FormErrors<keyof TValues & string> {
  checkForm(form);
  checkModel(CALLER, model);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: checkForm found both methods, and every FormApi's take a field's name and an updater of its meta
  const api = form as unknown as AnyFormApi;
  const errors = model.errors(error);
  const placed: Array<readonly [keyof TValues & string, string]> = [];
  const banner = [...errors.form];
  for (const { name } of model.fields) {
    clearBound(api, name);
    const text = errors.fields[name];
    if (text === undefined) {
      continue;
    }
    if (api.getFieldMeta(name) !== undefined) {
      placed.push([name, text]);
    } else if (!banner.includes(text)) {
      banner.push(text);
    }
  }
  const slot = placed.length > 1 ? 'onServer' : 'onSubmit';
  const fields: Partial<Record<keyof TValues & string, string>> = {};
  for (const [name, text] of placed) {
    bindText(api, name, slot, text);
    fields[name] = text;
  }
  return Object.freeze({
    fields: Object.freeze(fields),
    form: Object.freeze(banner),
  });
}
