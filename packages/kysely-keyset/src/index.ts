/**
 * `@nizam-os/kysely-keyset`: keyset pagination for Kysely on PostgreSQL. Everything
 * `@nizam-os/keyset-core` exports is re-exported, so an application imports from one
 * package; on top come `createDefineKeyset`, whose keysets check names
 * against the `DB` interface and carry `paginate` (it replaces the core's
 * definer of the same name and takes the same defaults), and `paginate`
 * itself for keysets defined with the core.
 * @ref https://kysely.dev/
 * @packageDocumentation
 */
export * from '@nizam-os/keyset-core';

export type {
  DefaultedTypedKeysetInit,
  DefineDefaultedKeyset,
  DefineKeyset,
  RelationsOf,
  TypedAggregateFieldInit,
  TypedColumnFieldInit,
  TypedFieldsInit,
  TypedKeysetInit,
  TypedRelationInit,
  TypedRelationsInit,
  TypedSearchInit,
} from './define-keyset';
export type {
  AnyDatabase,
  AnyExpressionBuilder,
  AnyQuery,
  KyselyKeyset,
  PaginateOptions,
  QueryEvent,
  RenderContext,
} from './types';

export { createDefineKeyset } from './define-keyset';
export { paginate } from './paginate';
export { renderPredicate } from './render/predicate';
export { renderTarget } from './render/target';
