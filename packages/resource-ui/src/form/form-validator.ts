/**
 * The form's Standard Schema (resource SPEC 20.3): it makes the write the
 * values make and runs the operation's write validator over it, then puts
 * each issue on the member its path names, the first per member, with the
 * text the server's `localizeErrors` gives the same refusal
 * (`localizeIssues`, SPEC 10.5), or the `required` message where the
 * member's value is blank (ADR 0015). An issue on no member the form holds
 * is the form's, each distinct text once. Texts are computed when the
 * validator runs, so a validation after a locale change renders in the new
 * locale. Accepted values are output as they are.
 * @ref https://standardschema.dev
 * @packageDocumentation
 */
import type { ResourceIssue } from '@nizam-os/resource-core';

import type {
  StandardIssue,
  SyncStandardSchema,
} from '../internal/standard-schema';
import type { FormPlan } from './form-plan';
import type { HeldMember } from './form-values';

import { memberAt } from './form-plan';
import { valueIn } from './form-values';
import { validatorInput, writeOf } from './form-write';
import { isBlank } from './value-kind';

/** The vendor of the validators the `@nizam-os` packages make. */
const VENDOR = 'nizam';

function memberText(
  plan: FormPlan,
  member: HeldMember,
  values: unknown,
  issue: ResourceIssue,
): string {
  return isBlank(member.kind, valueIn(values, member))
    ? plan.messages.validation.required({ field: member.descriptor.label() })
    : plan.issueText(plan.type, issue);
}

/** The write validator's issues, placed on the members the form holds or on the form. */
function placed(
  plan: FormPlan,
  values: unknown,
  issues: ReadonlyArray<ResourceIssue>,
): ReadonlyArray<StandardIssue> {
  const placedOn = new Set<string>();
  const formTexts = new Set<string>();
  const result: Array<StandardIssue> = [];
  for (const issue of issues) {
    const [part, name] = issue.path;
    const member = memberAt(plan, part, name);
    if (member === undefined) {
      const message = plan.issueText(plan.type, issue);
      if (!formTexts.has(message)) {
        formTexts.add(message);
        result.push({ message });
      }
    } else if (!placedOn.has(member.meta.name)) {
      placedOn.add(member.meta.name);
      result.push({
        message: memberText(plan, member, values, issue),
        path: [member.meta.name],
      });
    }
  }
  return result;
}

/** The Standard Schema of `plan`'s values. */
export function formValidator<TValues>(
  plan: FormPlan,
): SyncStandardSchema<TValues> {
  return Object.freeze({
    '~standard': Object.freeze({
      version: 1,
      vendor: VENDOR,
      validate: (values: unknown) => {
        const write = writeOf(plan.operation, plan.members, values);
        const result = plan.validator['~standard'].validate(
          validatorInput(write),
        );
        if (result.issues === undefined) {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: accepted values are output as they came in (SPEC 20.3); TanStack Form submits its own values and `write` converts them
          return { value: values as TValues };
        }
        return { issues: placed(plan, values, result.issues) };
      },
    }),
  });
}
