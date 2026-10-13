import type { ExpressionBuilder, SelectQueryBuilder } from 'kysely';

/**
 * The adapter's own types: the widened Kysely shapes it renders onto, the
 * pagination options, and the query event.
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
 * The database shape rendering happens against: every table and column
 * name the plan carries was validated by the definition, so the caller's
 * `DB` type adds nothing here. The caller's builder is widened to this
 * once, in `paginate`.
 */
export type AnyDatabase = Record<string, Record<string, unknown>>;

export type AnyExpressionBuilder = ExpressionBuilder<AnyDatabase, string>;

export type AnyQuery<O> = SelectQueryBuilder<AnyDatabase, string, O>;

/** What rendering needs beyond the node itself. */
export interface RenderContext {
  /** The main table, as the base query names it: the correlation side of aggregates. */
  readonly table: string;
}

/** One executed query, reported to `onQuery`. */
export interface QueryEvent {
  readonly kind: 'page' | 'total';
  readonly sql: string;
  readonly parameters: ReadonlyArray<unknown>;
  readonly durationMs: number;
  readonly rowCount: number;
}

export interface PaginateOptions {
  /** Run a second query counting the rows the filter (not the cursors) selects. Default false. */
  readonly total?: boolean | undefined;
  /** Called after each query with its SQL, parameters, and timing. */
  readonly onQuery?: ((event: QueryEvent) => void) | undefined;
  /**
   * Values the page's cursors are bound to besides the request, such as
   * the tenant `query` is scoped to (SPEC 6.1, ADR 0015): a cursor issued
   * under one context is rejected under any other, before a query runs.
   */
  readonly context?: CursorContext | undefined;
}

/** A keyset that paginates Kysely select queries. */
export interface KyselyKeyset<
  TFields extends FieldsInit = FieldsInit,
  TRelations extends RelationsInit = RelationsInit,
> extends Keyset<TFields, TRelations> {
  /**
   * Plans `request`, renders the plan onto `query`, runs it, and assembles
   * the page. `query` must be a plain selection of the definition's table:
   * its `order by`, `limit`, and `offset` are replaced.
   */
  paginate<TDatabase, TTable extends keyof TDatabase, TRow>(
    query: SelectQueryBuilder<TDatabase, TTable, TRow>,
    request: KeysetRequestOf<TFields, TRelations>,
    options?: PaginateOptions,
  ): Promise<Page<TRow>>;
}
