/**
 * How resource-core's own checks report (SPEC 6.4): a Zod `custom` issue
 * whose `params.nizam` holds the issue kind and the keyword's value, or a
 * validator's constraint code, so the mapping to `ResourceIssue` never
 * reads Zod's own codes or messages for them.
 * @ref https://zod.dev/api#check
 * @packageDocumentation
 */
import type { ParsePayload } from 'zod/v4/core';

import type { Violation } from './issue-kinds';

import { CONSTRAINT_MESSAGE, issueMessage } from './issue-messages';

/** What `params.nizam` holds: a kind and its `expected`, or a constraint code. */
export type IssueParams = Violation | { readonly code: string };

/** The `params` key resource-core's issues carry. */
export const PARAMS_KEY = 'nizam';

interface RaiseOptions {
  /** Whether later checks of the same value are skipped: a value outside its wire form is not compared further. */
  readonly abort: boolean;
  readonly path?: ReadonlyArray<string | number> | undefined;
}

function push(
  payload: ParsePayload,
  params: IssueParams,
  message: string,
  options: RaiseOptions,
): void {
  payload.issues.push({
    code: 'custom',
    message,
    input: payload.value,
    params: { [PARAMS_KEY]: params },
    continue: !options.abort,
    ...(options.path === undefined ? {} : { path: [...options.path] }),
  });
}

/** Reports a violation of a wire form or a rule. */
export function raise(
  payload: ParsePayload,
  violation: Violation,
  options: RaiseOptions,
): void {
  push(payload, violation, issueMessage(violation), options);
}

/** Reports a validator's rejection with its constraint's code. */
export function raiseCode(
  payload: ParsePayload,
  code: string,
  path?: ReadonlyArray<string | number>,
): void {
  push(payload, { code }, CONSTRAINT_MESSAGE, { abort: false, path });
}
