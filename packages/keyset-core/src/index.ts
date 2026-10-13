/**
 * `@nizam-os/keyset-core`: keyset pagination for any JavaScript runtime, database-free.
 * `defineKeyset` validates a definition (`createDefineKeyset` configures one
 * with an application's shared defaults); `plan` turns a request into a
 * query plan an adapter renders; `page` assembles the result with signed
 * cursors. See `docs/keyset/SPEC.md` for the contract.
 * @packageDocumentation
 */
export type {
  AggregateField,
  AggregateFieldInit,
  AggregateFieldType,
  AggregateFunction,
  AggregateInit,
  ArrayElementType,
  ArrayFieldInit,
  Collation,
  ColumnField,
  ColumnFieldInit,
  CursorInit,
  CursorSecret,
  EnumFieldInit,
  Field,
  FieldInit,
  FieldNameOf,
  FieldsInit,
  FieldType,
  KeysetDefinition,
  KeysetInit,
  Operator,
  PageInit,
  Relation,
  RelationFieldPath,
  RelationFieldsOf,
  RelationInit,
  RelationsInit,
  ScalarFieldInit,
  ScalarFieldType,
  SearchInit,
  SearchSpec,
  SortableFieldOf,
  SortDirection,
  SortField,
  SortInit,
  SortInput,
  TextFieldInit,
  TextSearchMode,
} from './definition/types';
export type {
  Keyset,
  KeysetRequestOf,
  NoRelations,
} from './definition/define-keyset';
export type {
  DefaultedKeysetInit,
  DefineDefaultedKeyset,
  DefineKeyset,
  KeysetDefaults,
} from './definition/create-define-keyset';
export type {
  Filter,
  FilterCondition,
  RelationFieldMap,
  RelationFilter,
} from './filter/types';
export type { ScalarCheck, ScalarValue } from './filter/values';
export type {
  CursorCodec,
  CursorCodecOptions,
  CursorDecodeResult,
} from './cursor/codec';
export type { PageInput, ResolvedPage } from './page/page-request';
export type { FinishOptions, Page } from './page/finish';
export type { KeysetRequest } from './plan/plan';
export type {
  AggregateTarget,
  ArrayOperator,
  ColumnTarget,
  ComparisonOperator,
  ConcatTarget,
  CursorValue,
  PlanKey,
  Predicate,
  QueryPlan,
  Target,
} from './plan/types';
export type {
  CursorContext,
  CursorContextValue,
  PlanOptions,
} from './plan/context';
export type {
  InvalidCursorReason,
  InvalidFilterValue,
  KeysetErrorCode,
} from './errors';

export { createDefineKeyset } from './definition/create-define-keyset';
export {
  defineKeyset,
  DEFAULT_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  isSearchConfig,
} from './definition/define-keyset';
export { isFieldName } from './definition/normalize-fields';
export {
  createCursorCodec,
  CURSOR_VERSION,
  MIN_SECRET_BYTES,
} from './cursor/codec';
export {
  InvalidCursorError,
  InvalidFilterError,
  InvalidFilterValueError,
  InvalidPageSizeError,
  isKeysetError,
  KeysetError,
  PageSizeExceededError,
  RangeNotSupportedError,
  UnsupportedFilterError,
  UnsupportedSearchError,
  UnsupportedSortError,
} from './errors';
export { checkScalar } from './filter/values';
export type { OperatorsOf } from './filter/operators';
export { isOperator, OPERATORS, operatorsFor } from './filter/operators';
export { escapeLike } from './internal/like';
export { finishPage } from './page/finish';
export { resolvePage } from './page/page-request';
export { createPlanner, keyAlias } from './plan/plan';
export { seekPredicate } from './plan/seek';
export { resolveSort, sortSignature } from './sort/resolve-sort';
