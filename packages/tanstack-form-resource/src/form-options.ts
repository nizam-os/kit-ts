/**
 * `resourceFormOptions(model)` (resource SPEC 20.5): the options of a
 * TanStack Form over a form model, a plain object that spreads into the
 * form of every adapter, and into the `useAppForm` of React's
 * `createFormHook`, so an application keeps its own field components. The
 * form starts from the model's values and runs the model's validator as
 * its `onDynamic` validator under `revalidateLogic()`: when it is first
 * submitted, and on every change after, so nobody meets an error before
 * submitting. `revalidateLogic` is the application's form-core's, its
 * adapter's own copy, so the form runs the logic of its own release (root
 * ADR 0011).
 * @ref https://tanstack.com/form/v1/docs/framework/react/guides/dynamic-validation
 * @ref https://tanstack.com/form/v1/docs/framework/react/guides/form-composition
 * @packageDocumentation
 */
import type { ValidationLogicFn } from '@tanstack/form-core';

import type { FormModel } from '@nizam-os/resource-ui';

import { revalidateLogic } from '@tanstack/form-core';

import { checkModel } from './form-model';

/** The options of a TanStack Form over a form model whose values are `TValues`. */
export interface ResourceFormOptions<TValues extends object> {
  readonly defaultValues: TValues;
  readonly validationLogic: ValidationLogicFn;
  readonly validators: {
    readonly onDynamic: FormModel<TValues, unknown>['validator'];
  };
}

/**
 * The options of a TanStack Form over `model`: its values to start from,
 * and its validator, run when the form is first submitted and on every
 * change after. Throws `TypeError` for a model no `resourceForm` returned.
 */
export function resourceFormOptions<TValues extends object>(
  model: FormModel<TValues, unknown>,
): ResourceFormOptions<TValues> {
  checkModel('resourceFormOptions', model);
  return {
    defaultValues: model.defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: model.validator },
  };
}
