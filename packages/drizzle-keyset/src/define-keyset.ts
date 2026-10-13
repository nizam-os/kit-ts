/**
 * `createDefineKeyset(schema, defaults?)` (SPEC 14.1, ADR 0017): a
 * `defineKeyset` whose definitions name the tables and columns of the
 * application's Drizzle schema object, as its own code names them. The
 * types check every name; at definition time the core's definer runs
 * first, then every name is resolved in the schema, so a definition that
 * reached the definer around the types fails at startup, not on a request.
 * The keysets carry `paginate`.
 * @ref https://orm.drizzle.team/docs/sql-schema-declaration
 * @packageDocumentation
 */
import type {
  CursorInit,
  DefaultedKeysetInit,
  DefineDefaultedKeyset as DefineCoreDefaultedKeyset,
  KeysetDefaults,
  NoRelations,
} from '@nizam-os/keyset-core';

import type {
  ColumnsOf,
  DefaultedTypedKeysetInit,
  RelationsOf,
  TablesOf,
  TypedFieldsInit,
  TypedKeysetInit,
  TypedRelationsInit,
} from './typed-init';
import type { DrizzleKeyset, KeysetSchema } from './types';

import { createDefineKeyset as createCoreDefineKeyset } from '@nizam-os/keyset-core';

import { checkNames } from './check-names';
import { paginate } from './paginate';

/** The `defineKeyset` of one schema. */
export type DefineKeyset<TSchema extends KeysetSchema> = <
  TTable extends TablesOf<TSchema>,
  const TFields extends TypedFieldsInit<TSchema, TTable, TRelations>,
  const TRelations extends TypedRelationsInit<TSchema, TTable> = NoRelations,
>(
  init: TypedKeysetInit<TSchema, TTable, TFields, TRelations>,
) => DrizzleKeyset<
  TFields,
  RelationsOf<TRelations>,
  ColumnsOf<TSchema, TTable>
>;

/** The `defineKeyset` of one schema, configured with a default cursor. */
export type DefineDefaultedKeyset<TSchema extends KeysetSchema> = <
  TTable extends TablesOf<TSchema>,
  const TFields extends TypedFieldsInit<TSchema, TTable, TRelations>,
  const TRelations extends TypedRelationsInit<TSchema, TTable> = NoRelations,
>(
  init: DefaultedTypedKeysetInit<TSchema, TTable, TFields, TRelations>,
) => DrizzleKeyset<
  TFields,
  RelationsOf<TRelations>,
  ColumnsOf<TSchema, TTable>
>;

/**
 * Binds `defineKeyset` to the application's Drizzle schema object, with
 * the defaults every definition shares merged under each one, member by
 * member (SPEC 3.6). Call it once, export the result, and define keysets
 * with it:
 *
 * ```ts
 * import * as schema from './schema';
 *
 * export const defineKeyset = createDefineKeyset(schema, {
 *   cursor: { secret: env.CURSOR_SECRET },
 *   page: { default: 25, max: 100 },
 * });
 * ```
 *
 * Defaults that hold a cursor make each definition's `cursor` optional; a
 * default the definitions cannot use throws `TypeError` here, at startup.
 */
export function createDefineKeyset<TSchema extends KeysetSchema>(
  schema: TSchema,
  defaults: KeysetDefaults & { readonly cursor: CursorInit },
): DefineDefaultedKeyset<TSchema>;
export function createDefineKeyset<TSchema extends KeysetSchema>(
  schema: TSchema,
  defaults?: KeysetDefaults,
): DefineKeyset<TSchema>;
export function createDefineKeyset<TSchema extends KeysetSchema>(
  schema: TSchema,
  defaults?: KeysetDefaults,
): DefineDefaultedKeyset<TSchema> {
  // Both overloads of the core's definer return the same function, which
  // takes a definition with or without its cursor and checks the merged
  // secret at definition time (SPEC 3.6); the overloads above keep the
  // static guarantee for the application.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the core's overloads differ only in the static type of one runtime function
  const define = createCoreDefineKeyset(defaults) as DefineCoreDefaultedKeyset;
  return <
    TTable extends TablesOf<TSchema>,
    const TFields extends TypedFieldsInit<TSchema, TTable, TRelations>,
    const TRelations extends TypedRelationsInit<TSchema, TTable> = NoRelations,
  >(
    init: DefaultedTypedKeysetInit<TSchema, TTable, TFields, TRelations>,
  ): DrizzleKeyset<
    TFields,
    RelationsOf<TRelations>,
    ColumnsOf<TSchema, TTable>
  > => {
    // The typed `on` (a partial map over the related table's columns) is
    // the core's `Record<string, string>` at runtime; nothing else differs.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: TypedRelationInit.on narrows RelationInit.on's keys per table; the runtime shape is identical
    const coreInit = init as unknown as DefaultedKeysetInit<
      TFields,
      RelationsOf<TRelations>
    >;
    const keyset = define(coreInit);
    checkNames(keyset.definition, schema);
    return {
      ...keyset,
      paginate: async (db, request, options) =>
        paginate(keyset, schema, db, request, options),
    };
  };
}
