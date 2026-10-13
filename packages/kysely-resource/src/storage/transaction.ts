import type {
  Compilable,
  CompiledQuery,
  Kysely,
  RawBuilder,
  Transaction,
} from 'kysely';

/**
 * The adapter's transaction protocol (SPEC 18.2, obligation 1 of resource
 * SPEC 12.8). A transaction runs at READ COMMITTED, which the lifecycle's
 * row locks assume, whatever `default_transaction_isolation` says. Its
 * first statement fixes how values print and sets each scope's parameter
 * with `set_config(name, value, true)`, the form of `SET LOCAL` that takes
 * parameters, so nothing outlives the transaction on a pooled connection.
 * Every statement the adapter runs keeps the first error one raised: when
 * the run goes on and resolves after it, the transaction rejects with that
 * error, since PostgreSQL turns the COMMIT of an aborted transaction into
 * a rollback that reports no error.
 * @ref https://www.postgresql.org/docs/18/sql-set-transaction.html
 * @ref https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET (`set_config` with `is_local` true is `SET LOCAL`)
 * @ref https://www.postgresql.org/docs/18/runtime-config-client.html
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/transam/xact.c (EndTransactionBlock: "Since COMMIT may actually do a ROLLBACK")
 * @ref https://kysely-org.github.io/kysely-apidoc/classes/Kysely.html#transaction
 * @packageDocumentation
 */
import type { AnyDatabase } from '@nizam-os/kysely-keyset';
import type { ScopeValue } from '@nizam-os/resource-core/server';

import { sql } from 'kysely';

/**
 * How every value prints in the adapter's transactions (ADR 0012): dates
 * and times in ISO form and UTC, intervals in PostgreSQL's own form,
 * floats as the shortest text that reads back exactly, and bytea as hex.
 */
const SESSION_SETTINGS: ReadonlyArray<readonly [string, string]> = [
  ['TimeZone', 'UTC'],
  ['DateStyle', 'ISO, YMD'],
  ['IntervalStyle', 'postgres'],
  ['extra_float_digits', '1'],
  ['bytea_output', 'hex'],
];

/** A statement built on the transaction, compiled or ready to compile. */
type Build<TRow> = (
  db: Transaction<AnyDatabase>,
) => CompiledQuery<TRow> | Compilable<TRow>;

/** The transaction's first statement: the session settings, then each scope's parameter. */
function opening(scopes: ReadonlyArray<ScopeValue>): RawBuilder<unknown> {
  const settings = SESSION_SETTINGS.map(
    ([name, value]) =>
      sql`set_config(${sql.lit(name)}, ${sql.lit(value)}, true)`,
  );
  const parameters = scopes.map(
    (scope) =>
      sql`set_config(${scope.session}::text, ${String(scope.value)}::text, true)`,
  );
  return sql`select ${sql.join([...settings, ...parameters])}`;
}

/**
 * The adapter's transaction (the `TTransaction` of resource SPEC 12.8):
 * a Kysely transaction without the application's plugins, the scopes it
 * set, and the first error one of its statements raised.
 */
export class KyselyTransaction {
  /** The scopes the transaction set, in the order given. */
  public readonly scopes: ReadonlyArray<ScopeValue>;
  readonly #db: Transaction<AnyDatabase>;
  #failure: { readonly error: unknown } | undefined;

  private constructor(
    db: Transaction<AnyDatabase>,
    scopes: ReadonlyArray<ScopeValue>,
  ) {
    this.#db = db;
    this.scopes = scopes;
  }

  /**
   * Runs `run` in a transaction of `db` that first sets the session
   * settings and `scopes`; commits when it resolves and no statement
   * failed. Kysely rolls back and rejects with what the callback threw:
   * what `run` threw, unchanged, or the error of the first statement that
   * failed.
   */
  public static async run<TResult>(
    db: Kysely<AnyDatabase>,
    scopes: ReadonlyArray<ScopeValue>,
    run: (tx: KyselyTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return db
      .transaction()
      .setIsolationLevel('read committed')
      .execute(async (trx) => {
        const tx = new KyselyTransaction(trx, scopes);
        await tx.execute((plain) => opening(scopes).compile(plain));
        const result = await run(tx);
        if (tx.#failure !== undefined) {
          throw tx.#failure.error;
        }
        return result;
      });
  }

  /** Runs one statement of the adapter's on the transaction and returns its rows, keeping the first error a statement raised. */
  public async execute<TRow>(build: Build<TRow>): Promise<ReadonlyArray<TRow>> {
    try {
      const { rows } = await this.#db.executeQuery(build(this.#db));
      return rows;
    } catch (error) {
      this.#failure ??= { error };
      throw error;
    }
  }
}
