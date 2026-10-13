/**
 * `resourceForm(resource, operation, options)` (resource SPEC 20.3, 20.4):
 * a framework-free model of a form over one operation of a declared
 * resource, which TanStack Form drives (ADR 0015): the members it holds,
 * the values it starts from, a synchronous Standard Schema whose issues
 * are the declaration's and read as the server words them, the write the
 * values make, and a refused write's errors by field.
 * @packageDocumentation
 */
import type { DeclaredShape } from '../internal/declared';
import type { FormPlan, WriteValidator } from './form-plan';
import type {
  FormMemberName,
  FormModel,
  FormModelOptions,
  FormOperation,
  FormValues,
  FormWriteOf,
} from './form-types';

import { localizeIssues } from '@nizam-os/resource-core';

import { descriptorsOf } from '../fields/fields-of';
import { checkDeclared } from '../internal/declared';
import { formErrors } from './form-errors';
import { checkOperation, checkOptions, heldDescriptors } from './form-options';
import { formValidator } from './form-validator';
import { heldMember } from './form-values';
import { validatorInput, writeOf } from './form-write';

const CALLER = 'resourceForm';

/** What a form reads of a declared resource besides its members: what it serves and its write validators. */
export interface FormResource extends DeclaredShape {
  readonly declaration: { readonly operations: ReadonlyArray<string> };
  readonly write: {
    readonly create: WriteValidator;
    readonly update: WriteValidator;
  };
}

/** The write of `values`, which a submit handler receives only once the validator accepted them. */
function checkedWrite(plan: FormPlan, values: unknown): unknown {
  const write = writeOf(plan.operation, plan.members, values);
  if (
    plan.validator['~standard'].validate(validatorInput(write)).issues !==
    undefined
  ) {
    throw new TypeError(
      `${CALLER}.write: the values do not pass the form's validator`,
    );
  }
  return write;
}

/**
 * A form over `operation` of `resource`, labeled by `options.messages`,
 * starting from the defaults on create and from `options.record` on
 * update. Throws `TypeError` before it returns for a resource no
 * `declareResource` returned or one that does not serve `operation`, for
 * messages no definer returned or that do not label the resource's
 * members, for options that do not fit the operation, and for a record
 * that lacks a member the form holds.
 */
export function resourceForm<
  TResource extends FormResource,
  TOperation extends FormOperation,
  const TName extends FormMemberName<TResource, TOperation> = FormMemberName<
    TResource,
    TOperation
  >,
>(
  resource: TResource,
  operation: TOperation,
  options: FormModelOptions<TOperation, TName>,
): FormModel<
  FormValues<TResource, TOperation, TName>,
  FormWriteOf<TResource, TOperation>
> {
  checkDeclared(CALLER, resource);
  checkOperation(resource, operation);
  const checked = checkOptions(operation, options);
  const descriptors = descriptorsOf(CALLER, resource, checked.messages);
  const type = resource.names.type;
  const members = heldDescriptors(
    type,
    operation,
    descriptors,
    checked.members,
  ).map((descriptor) => heldMember(descriptor, operation, checked.record));
  const plan: FormPlan = {
    type,
    operation,
    members,
    validator: resource.write[operation],
    messages: checked.messages,
    issueText: localizeIssues(checked.messages),
  };
  const model = {
    type,
    operation,
    fields: Object.freeze(members.map((member) => member.descriptor)),
    defaultValues: Object.freeze(
      Object.fromEntries(
        members.map((member) => [member.meta.name, member.start]),
      ),
    ),
    validator: formValidator(plan),
    write: (values: unknown) => checkedWrite(plan, values),
    errors: (error: unknown) => formErrors(plan, error),
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the values hold one member per held descriptor, which FormValues types from the same write validator, and the write is the client's input of the operation
  return Object.freeze(model) as unknown as FormModel<
    FormValues<TResource, TOperation, TName>,
    FormWriteOf<TResource, TOperation>
  >;
}
