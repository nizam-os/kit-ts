/**
 * Zod issues as `ResourceIssue`s (SPEC 6.4, ADR 0007): the issue kinds of
 * JSON Schema's validation keywords, or a validator's constraint code, with
 * the keyword's value as `expected` and an English message that holds no
 * request data. resource-core's own checks carry their kind in
 * `params.nizam`; the few built-in Zod issues the composed schemas raise
 * are read by their code and data, and anything a codec's schema raises is
 * `format` with the codec's name, since the codec owns that representation.
 * Run the schema with `reportInput`, so a missing member and `null` can be
 * told apart from a value of the wrong type.
 * @ref https://json-schema.org/draft/2020-12/json-schema-validation#section-6
 * @ref https://zod.dev/error-customization
 * @packageDocumentation
 */
import type { $ZodIssue } from 'zod/v4/core';

import type { IssueKind } from './issue-kinds';
import type { IssueParams } from './raise';

import { ISSUE_KINDS } from './issue-kinds';
import { CONSTRAINT_MESSAGE, issueMessage } from './issue-messages';
import { PARAMS_KEY } from './raise';

/** A schema issue: a Standard Schema issue and a `@nizam-os/ban-core` validation issue. */
export interface ResourceIssue {
  /** English, constant per kind and parameter, never request data. */
  readonly message: string;
  /** Public names and array indexes. */
  readonly path: ReadonlyArray<string | number>;
  /** An issue kind (`IssueKind`), or a validator's constraint code. */
  readonly code: string;
  /** The keyword's value as text. */
  readonly expected?: string | undefined;
}

/** What the mapping knows about the member an issue lies in. */
export interface MemberInfo {
  /** Whether the member's value is an `int2` or `int4`, whose JSON type is `integer`. */
  readonly integer: boolean;
  /** Whether the member is an array of `int2` or `int4`. */
  readonly integerElements: boolean;
  /** The codec the member's value takes, if any. */
  readonly codec: string | undefined;
}

/** The member a path leads to, and how far inside it the path ends: 0 at the member itself. */
interface MemberAt {
  readonly info: MemberInfo;
  readonly depth: number;
}

/** Finds the member of a path; `undefined` for a path at the object itself. */
export type FindMember = (
  path: ReadonlyArray<string | number>,
) => MemberAt | undefined;

type Path = ReadonlyArray<string | number>;

function kindIssue(
  path: Path,
  kind: IssueKind,
  expected?: string,
): ResourceIssue {
  return {
    message: issueMessage({ kind, expected }),
    path,
    code: kind,
    ...(expected === undefined ? {} : { expected }),
  };
}

function isIssueKind(value: unknown): value is IssueKind {
  return ISSUE_KINDS.some((kind) => kind === value);
}

/** resource-core's params on an issue of its own checks, or `undefined` for any other issue. */
function readParams(issue: $ZodIssue): IssueParams | undefined {
  const params: unknown =
    issue.code === 'custom' ? issue.params?.[PARAMS_KEY] : undefined;
  if (typeof params !== 'object' || params === null) {
    return undefined;
  }
  if ('code' in params && typeof params.code === 'string') {
    return { code: params.code };
  }
  if ('kind' in params && isIssueKind(params.kind)) {
    const expected = 'expected' in params ? params.expected : undefined;
    return {
      kind: params.kind,
      expected: typeof expected === 'string' ? expected : undefined,
    };
  }
  return undefined;
}

function ownIssue(issue: $ZodIssue, path: Path): ResourceIssue | undefined {
  const params = readParams(issue);
  if (params === undefined) {
    return undefined;
  }
  if ('code' in params) {
    return { message: CONSTRAINT_MESSAGE, path, code: params.code };
  }
  return kindIssue(path, params.kind, params.expected);
}

function isRequired(issue: $ZodIssue, member: MemberAt | undefined): boolean {
  return (
    issue.code === 'invalid_type' &&
    (issue.input === undefined || (issue.input === null && member?.depth === 0))
  );
}

/** The JSON type Zod expected, named as JSON Schema names it. */
function expectedType(expected: string, member: MemberAt | undefined): string {
  if (expected === 'int') {
    return 'integer';
  }
  const integer =
    member !== undefined &&
    ((member.depth === 0 && member.info.integer) ||
      (member.depth === 1 && member.info.integerElements));
  return expected === 'number' && integer ? 'integer' : expected;
}

type IssueOf<TCode extends $ZodIssue['code']> = Extract<
  $ZodIssue,
  { readonly code: TCode }
>;

/**
 * The built-in issues the composed schemas raise: a wrong JSON type, a
 * string length (`.min`, `.max`), an enum or literal, and unknown keys.
 * Any other Zod issue can only come from a codec's schema, which the
 * caller maps first, so it is a `format` issue without a name.
 */
const BUILT_IN: {
  readonly [K in $ZodIssue['code']]: (
    issue: IssueOf<K>,
    path: Path,
    member: MemberAt | undefined,
  ) => ReadonlyArray<ResourceIssue>;
} = {
  invalid_type: (issue, path, member) => [
    kindIssue(path, 'type', expectedType(issue.expected, member)),
  ],
  too_small: (issue, path) => [
    kindIssue(path, 'minLength', String(issue.minimum)),
  ],
  too_big: (issue, path) => [
    kindIssue(path, 'maxLength', String(issue.maximum)),
  ],
  invalid_value: (issue, path) => [
    kindIssue(path, 'enum', JSON.stringify(issue.values.map(String))),
  ],
  unrecognized_keys: (issue, path) =>
    issue.keys.map((key) => kindIssue([...path, key], 'additionalProperties')),
  invalid_format: (_issue, path) => [kindIssue(path, 'format')],
  not_multiple_of: (_issue, path) => [kindIssue(path, 'format')],
  invalid_union: (_issue, path) => [kindIssue(path, 'format')],
  invalid_key: (_issue, path) => [kindIssue(path, 'format')],
  invalid_element: (_issue, path) => [kindIssue(path, 'format')],
  custom: (_issue, path) => [kindIssue(path, 'format')],
};

function builtInIssues<TCode extends $ZodIssue['code']>(
  issue: IssueOf<TCode>,
  path: Path,
  member: MemberAt | undefined,
): ReadonlyArray<ResourceIssue> {
  const map: (
    issue: IssueOf<TCode>,
    path: Path,
    member: MemberAt | undefined,
  ) => ReadonlyArray<ResourceIssue> = BUILT_IN[issue.code];
  return map(issue, path, member);
}

/** The `ResourceIssue`s of one Zod issue: one per unknown key, otherwise one. */
function mapIssue(
  issue: $ZodIssue,
  findMember: FindMember,
): ReadonlyArray<ResourceIssue> {
  const path = issue.path.map((key) =>
    typeof key === 'symbol' ? String(key) : key,
  );
  const own = ownIssue(issue, path);
  if (own !== undefined) {
    return [own];
  }
  const member = findMember(path);
  if (isRequired(issue, member)) {
    return [kindIssue(path, 'required')];
  }
  const codec = member?.info.codec;
  if (codec !== undefined) {
    return [kindIssue(path, 'format', codec)];
  }
  return builtInIssues(issue, path, member);
}

/** Maps a failed parse's issues, in order. */
export function toResourceIssues(
  issues: ReadonlyArray<$ZodIssue>,
  findMember: FindMember,
): ReadonlyArray<ResourceIssue> {
  return issues.flatMap((issue) => mapIssue(issue, findMember));
}
