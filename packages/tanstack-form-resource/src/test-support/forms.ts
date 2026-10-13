/**
 * A TanStack Form over a form model as a screen holds one (resource SPEC
 * 20.5): a mounted form-core `FormApi` made from
 * `resourceFormOptions(model)` and a mounted `FieldApi` for each member
 * the screen renders, as every adapter's forms and fields are made, which
 * a test drives as a person's input does, through `handleChange` and
 * `handleBlur`, and reads as a field component does. Not published with
 * the package.
 * @packageDocumentation
 */
import type { AnyFieldApi, AnyFormApi } from '@tanstack/form-core';

import type { FormModel } from '@nizam-os/resource-ui';

import { FieldApi, FormApi } from '@tanstack/form-core';

import { resourceFormOptions } from '../form-options';
import { isRecord } from '../internal/object';

/** A form's values, as the fixture's resources, typed wide, type them. */
type Values = Readonly<Record<string, unknown>>;

/** What a submit handler does with the values, after the form recorded them. */
type Handler = (values: Values, form: AnyFormApi) => unknown;

/** A mounted form, its fields by name, and the values each submit handed its handler. */
export interface MountedForm {
  readonly form: AnyFormApi;
  readonly field: (name: string) => AnyFieldApi;
  readonly submitted: ReadonlyArray<Values>;
}

/** The submit handler of a form, and the members it renders a field for, by default every one the model holds. */
export interface MountOptions {
  readonly onSubmit?: Handler | undefined;
  readonly rendered?: ReadonlyArray<string> | undefined;
}

/** A form over `model`, whose submit handler records the values, then runs `options.onSubmit`. */
export function mountForm(
  model: FormModel<Values, unknown>,
  options: MountOptions = {},
): MountedForm {
  const submitted: Array<Values> = [];
  const form = new FormApi({
    ...resourceFormOptions(model),
    // The submit meta `undefined` instead of `never`, so the form is an
    // `AnyFormApi`, whose type parameters are invariant.
    onSubmitMeta: undefined,
    onSubmit: async ({ value, formApi }) => {
      submitted.push(value);
      await options.onSubmit?.(value, formApi);
    },
  });
  form.mount();
  const fields = new Map<string, AnyFieldApi>();
  for (const name of options.rendered ??
    model.fields.map((descriptor) => descriptor.name)) {
    const field = new FieldApi({ form, name });
    field.mount();
    fields.set(name, field);
  }
  return {
    form,
    field: (name) => {
      const field = fields.get(name);
      if (field === undefined) {
        throw new Error(`the form renders no field ${name}`);
      }
      return field;
    },
    submitted,
  };
}

/** What a field component renders: the `message` of each of the field's errors. */
export function shown(field: AnyFieldApi): Array<string> {
  const errors: ReadonlyArray<unknown> = field.state.meta.errors;
  return errors.map((error) =>
    isRecord(error) && typeof error['message'] === 'string'
      ? error['message']
      : JSON.stringify(error),
  );
}
