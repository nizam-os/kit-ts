import type { SQL } from 'drizzle-orm';
import type {
  PgDatabase,
  PgQueryResultHKT,
  SelectedFields,
} from 'drizzle-orm/pg-core';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

/**
 * The adapter's own types: the schema the plan's names resolve in, what
 * rendering needs beside a node, the database `paginate` runs on, its
 * options, and the query event (SPEC 14).
 * @packageDocumentation
 */
import type {
  CursorContext,
  FieldsInit,
  Keyset,
  KeysetRequestOf,
  Page,
  RelationsInit,
} from '@nizam-os/keyset-core';

/**
 * The application's Drizzle schema object, the one it hands `drizzle()`
 * (`import * as schema from './schema'`). Its members that are PostgreSQL
 * tables are what a definition names, by key; the others (relations,
 * enums, views) are ignored.
 */
export type KeysetSchema = Readonly<Record<string, unknown>>;

/** What rendering needs beyond the node itself (SPEC 14.2). */
export interface RenderContext {
  /** The schema the plan's table and column names resolve in. */
  readonly schema: KeysetSchema;
  /** The main table's key in the schema: the correlation side of aggregates and `exists`. */
  readonly table: string;
}

/**
 * What `paginate` runs on: anything with Drizzle's PostgreSQL `select`, so
 * a database of any driver, a transaction, or a `withReplicas` database.
 */
export type KeysetDatabase = Pick<PgDatabase<PgQueryResultHKT>, 'select'>;

/** One executed query, reported to `onQuery`. */
export interface QueryEvent {
  readonly kind: 'page' | 'total';
  readonly sql: string;
  readonly parameters: ReadonlyArray<unknown>;
  readonly durationMs: number;
  readonly rowCount: number;
}

export interface PaginateOptions<
  TSelection extends SelectedFields = SelectedFields,
> {
  /**
   * The caller's selection, as `db.select(fields)` takes it; the table's
   * columns by default. A member may not be named like a key alias
   * (`keyset0`, `keyset1`, ...) or a value alias (`keyset0v`, `keyset1v`,
   * ...), which `paginate` adds and strips.
   */
  readonly select?: TSelection | undefined;
  /**
   * The caller's condition, such as the tenant the rows belong to: the page
   * and the total stay inside it. Parenthesized before anything is joined
   * to it, so a condition written as `sql` with an `or` keeps its meaning.
   */
  readonly where?: SQL | undefined;
  /** Run a second query counting the rows the filter (not the cursors) selects. Default false. */
  readonly total?: boolean | undefined;
  /** Called after each query with its SQL, parameters, and timing. */
  readonly onQuery?: ((event: QueryEvent) => void) | undefined;
  /**
   * Values the page's cursors are bound to besides the request, such as
   * the tenant of `where` (SPEC 6.1, ADR 0015): a cursor issued under one
   * context is rejected under any other, before a query runs.
   */
  readonly context?: CursorContext | undefined;
}

/** A keyset that paginates a table of the schema it was defined over. */
export interface DrizzleKeyset<
  TFields extends FieldsInit = FieldsInit,
  TRelations extends RelationsInit = RelationsInit,
  TColumns extends SelectedFields = SelectedFields,
> extends Keyset<TFields, TRelations> {
  /**
   * Plans `request`, builds the select over the definition's table with the
   * caller's selection and condition, runs it on `db`, and assembles the
   * page (SPEC 14.3). The rows are the selection's, typed by Drizzle.
   */
  paginate<TSelection extends SelectedFields = TColumns>(
    db: KeysetDatabase,
    request: KeysetRequestOf<TFields, TRelations>,
    options?: PaginateOptions<TSelection>,
  ): Promise<Page<SelectResultFields<NoInfer<TSelection>>>>;
}
