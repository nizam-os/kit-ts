/**
 * What a form model is built from (resource SPEC 20.3): the members it
 * holds, the operation's write validator, and the messages its texts come
 * from. The validator, the write, and the error mapping read one plan.
 * @packageDocumentation
 */
import type {
  FieldMeta,
  IssueText,
  Messages,
  ResourceIssue,
} from '@nizam-os/resource-core';

import type { FormOperation } from './form-types';
import type { HeldMember } from './form-values';

/** The write validator of an operation (SPEC 6.2): synchronous, its issues `ResourceIssue`s. */
export interface WriteValidator {
  readonly '~standard': {
    readonly validate: (value: unknown) => {
      readonly issues?: ReadonlyArray<ResourceIssue> | undefined;
    };
  };
}

export interface FormPlan {
  readonly type: string;
  readonly operation: FormOperation;
  /** In declaration order. */
  readonly members: ReadonlyArray<HeldMember>;
  readonly validator: WriteValidator;
  readonly messages: Messages;
  readonly issueText: IssueText;
}

/** The part of a write, and of a request document, that holds a member of `meta`'s kind. */
export function partOf(
  meta: Pick<FieldMeta, 'kind'>,
): 'attributes' | 'relationships' {
  return meta.kind === 'relationship' ? 'relationships' : 'attributes';
}

/** The member the form holds at `part` and `name`, as an issue path or a pointer names it. */
export function memberAt(
  plan: FormPlan,
  part: unknown,
  name: unknown,
): HeldMember | undefined {
  return plan.members.find(
    (member) => member.meta.name === name && partOf(member.meta) === part,
  );
}
