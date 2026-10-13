/**
 * `@nizam-os/resource-core`: one declaration per PostgreSQL table, keyed by
 * its database names and typed by the public catalog `@nizam-os/pg-catalog`
 * extracts, from which the public API follows. See `docs/resource/SPEC.md`
 * for the contract.
 * @packageDocumentation
 */
export type { StorageCodec, StorageCodecs } from './codecs/storage-codecs';
export type { Codec, Validator } from './codecs/types';
export type { DeclarationCheck } from './declare/declaration-check';
export type { DeclareResourceConfig } from './declare/create-declare-resource';
export type { DeclareResource } from './declare/declare-resource-type';
export type {
  AnyDeclaredResource,
  DeclaredResource,
} from './declare/declared-resource';
export type {
  CodecRegistry,
  CodecTypes,
  DeclareContext,
  DomainRule,
  DomainRules,
  EmptyRegistry,
  ScopeColumn,
  ScopeRegistry,
  ValidatorRegistry,
} from './declare/registries';
export type {
  Access,
  Declaration,
  FieldDeclaration,
  Operation,
  RelationshipDeclaration,
  RelationshipOperator,
  RuleDeclaration,
  SearchDeclaration,
  SortDeclaration,
} from './declare/types';
export type { ErrorCatalog } from './errors/error-catalog';
export type { ConstraintKind, ErrorEntry } from './errors/error-entry';
export type { ClientTypesOf } from './jsonapi/client-types';
export type {
  ErrorTransform,
  LocalizeErrorsOptions,
} from './messages/localize-errors';
export type { IssueText } from './messages/localize-issues';
export type { MessagesFor } from './messages/messages-for';
export type {
  CodeInputs,
  ConstraintInputs,
  ErrorText,
  IssueInputs,
  Label,
  Message,
  Messages,
} from './messages/types';
export type {
  FieldDefault,
  FieldFacts,
  FieldLimits,
  FieldMeta,
  ItemMeta,
  WireType,
} from './meta/types';
export type { ResourceNames } from './names/types';
export type { Infer } from './schema/infer';
export type { IssueKind } from './schema/issue-kinds';
export type { ResourceIssue } from './schema/issues';

export { defineCodec } from './codecs/define-codec';
export { defineValidator } from './codecs/define-validator';
export { createDeclareResource } from './declare/create-declare-resource';
export { errorCatalog } from './errors/error-catalog';
export { defaultMessages } from './messages/default-messages';
export { defineMessages } from './messages/define-messages';
export { localizeErrors } from './messages/localize-errors';
export { localizeIssues } from './messages/localize-issues';
export { ISSUE_KINDS } from './schema/issue-kinds';
