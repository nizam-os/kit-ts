/**
 * Public names must be JSON:API member names (SPEC 4.2), and a field or a
 * relationship must not take a member every resource object has or a
 * member of `Object.prototype`. `@nizam-os/jsonapi-core`'s `defineResource`
 * refuses the same names, so a resource that passes here passes there.
 * `IsMemberName` is the type-level twin of `isMemberName`, pinned to it by
 * one case table (`test-support/member-name-cases.ts`): a name is at least
 * one character, holds no reserved character, and neither starts nor ends
 * with `-`, `_`, or a space.
 * @ref https://jsonapi.org/format/1.1/#document-member-names
 * @ref https://jsonapi.org/format/1.1/#document-member-names-reserved-characters
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-fields
 * @packageDocumentation
 */
import { isMemberName } from '@nizam-os/jsonapi-core';

/** U+0000 to U+001F, which JSON:API reserves with U+007F. */
type ControlCharacter =
  | '\u0000'
  | '\u0001'
  | '\u0002'
  | '\u0003'
  | '\u0004'
  | '\u0005'
  | '\u0006'
  | '\u0007'
  | '\u0008'
  | '\u0009'
  | '\u000A'
  | '\u000B'
  | '\u000C'
  | '\u000D'
  | '\u000E'
  | '\u000F'
  | '\u0010'
  | '\u0011'
  | '\u0012'
  | '\u0013'
  | '\u0014'
  | '\u0015'
  | '\u0016'
  | '\u0017'
  | '\u0018'
  | '\u0019'
  | '\u001A'
  | '\u001B'
  | '\u001C'
  | '\u001D'
  | '\u001E'
  | '\u001F';

/** The characters JSON:API reserves: 30 ASCII punctuation characters, the C0 controls, and U+007F. */
type ReservedCharacter =
  | '+'
  | ','
  | '.'
  | '['
  | ']'
  | '!'
  | '"'
  | '#'
  | '$'
  | '%'
  | '&'
  | "'"
  | '('
  | ')'
  | '*'
  | '/'
  | ':'
  | ';'
  | '<'
  | '='
  | '>'
  | '?'
  | '@'
  | '\\'
  | '^'
  | '`'
  | '{'
  | '|'
  | '}'
  | '~'
  | '\u007F'
  | ControlCharacter;

/** Allowed only between two globally allowed characters. */
type InnerCharacter = '-' | '_' | ' ';

/**
 * The names JSON:API refuses, other than the empty one. It is named
 * because TypeScript 7 rebuilds a union of template literal types written
 * inline in a conditional for every name it checks, which cost four to
 * seven times as much on the real catalogs of SPEC 15.5.
 */
type NotAMemberName =
  | `${InnerCharacter}${string}`
  | `${string}${InnerCharacter}`
  | `${string}${ReservedCharacter}${string}`;

/** Whether a literal name is a JSON:API member name; `true` for `string`, which the runtime checks. */
export type IsMemberName<TName extends string> = TName extends ''
  ? false
  : TName extends NotAMemberName
    ? false
    : true;

/** The members every resource object has, with which its fields share a namespace (jsonapi-core adds `lid`). */
export type ResourceObjectMember = 'type' | 'id' | 'lid';

/** Names whose lookup reaches `Object.prototype`, which `@nizam-os/jsonapi-core` refuses. */
export type PrototypeName = 'constructor' | 'prototype';

const NOT_A_MEMBER_NAME = 'is not a JSON:API member name';
const RESOURCE_OBJECT = 'is a member of every resource object';
const PROTOTYPE = 'is a member of Object.prototype';

const RESOURCE_OBJECT_MEMBERS: ReadonlySet<string> =
  new Set<ResourceObjectMember>(['type', 'id', 'lid']);
const PROTOTYPE_NAMES: ReadonlySet<string> = new Set<PrototypeName>([
  'constructor',
  'prototype',
]);

/** Why a resource type cannot be `TName`, or `never`. */
export type TypeNameProblem<TName extends string> =
  IsMemberName<TName> extends false
    ? typeof NOT_A_MEMBER_NAME
    : TName extends PrototypeName
      ? typeof PROTOTYPE
      : never;

/** Why a field or relationship cannot be named `TName`, or `never`. */
export type MemberNameProblem<TName extends string> =
  TName extends ResourceObjectMember
    ? typeof RESOURCE_OBJECT
    : TypeNameProblem<TName>;

/** Why a resource type cannot be `name`, or `undefined`. */
export function typeNameProblem(name: string): string | undefined {
  if (!isMemberName(name)) {
    return NOT_A_MEMBER_NAME;
  }
  return PROTOTYPE_NAMES.has(name) ? PROTOTYPE : undefined;
}

/** Why a field or relationship cannot be named `name`, or `undefined`. */
export function memberNameProblem(name: string): string | undefined {
  return RESOURCE_OBJECT_MEMBERS.has(name)
    ? RESOURCE_OBJECT
    : typeNameProblem(name);
}
