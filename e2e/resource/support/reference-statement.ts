/**
 * The statements of the reference storage adapter (resource SPEC 12.9),
 * one resource in one transaction at a time: the assignments of a write,
 * with the id, the server values, and the scope column on create; the
 * scope's predicate; and the key. Also the guard that keeps the errors a
 * transaction's statements raised.
 */
import type { PublicTable } from '@nizam-os/catalog-core';
import type { DeclaredResource, FieldMeta } from '@nizam-os/resource-core';
import type { ScopeValue, StorageWrite } from '@nizam-os/resource-core/server';

import type {
  ReferenceTransaction,
  SqlClient,
  SqlContext,
} from './reference-sql.ts';

import {
  columnOf,
  Parameters,
  quoted,
  tableName,
  tableOf,
  writeText,
} from './reference-sql.ts';

/** A transaction's client that keeps every error its statements raised. */
export function guarded(client: SqlClient): {
  readonly client: SqlClient;
  readonly failures: ReadonlyArray<unknown>;
} {
  const failures: Array<unknown> = [];
  return {
    client: {
      query: async (sql, parameters) => {
        try {
          return await client.query(sql, parameters);
        } catch (error) {
          failures.push(error);
          throw error;
        }
      },
    },
    failures,
  };
}

/** The member a write names; throws for a name the resource does not have. */
function memberOf(resource: DeclaredResource, name: string): FieldMeta {
  const meta = resource.fields[name];
  if (meta === undefined) {
    throw new Error(`${resource.names.type} has no member ${name}`);
  }
  return meta;
}

/** The value the transaction gives the resource's scope; `undefined` for an unscoped resource. */
export function scopeOf(
  resource: DeclaredResource,
  tx: ReferenceTransaction,
): ScopeValue | undefined {
  const name = resource.declaration.scope;
  if (name === undefined) {
    return undefined;
  }
  const scope = tx.scopes.find((value) => value.scope === name);
  if (scope === undefined) {
    throw new Error(
      `${resource.names.type}: the transaction has no value for scope ${name}`,
    );
  }
  return scope;
}

/** The SQL of one resource in one transaction. */
export class Statement {
  public readonly parameters: Parameters = new Parameters();
  public readonly table: PublicTable;
  private readonly context: SqlContext;
  private readonly resource: DeclaredResource;
  private readonly scope: ScopeValue | undefined;

  public constructor(
    context: SqlContext,
    resource: DeclaredResource,
    tx: ReferenceTransaction,
  ) {
    this.context = context;
    this.resource = resource;
    this.table = tableOf(context, resource);
    this.scope = scopeOf(resource, tx);
  }

  public get name(): string {
    return tableName(this.table);
  }

  /** `column = $n` for each member of `input`, then for its id, server values, and the scope when `create`. */
  public assignments(
    input: StorageWrite,
    create: boolean,
  ): ReadonlyArray<readonly [string, string]> {
    const pairs: Array<readonly [string, string]> = [];
    const put = (column: string, text: string | null): void => {
      const placeholder = this.parameters.add(
        text,
        columnOf(this.table, column),
      );
      pairs.push([quoted(column), placeholder]);
    };
    for (const [name, value] of Object.entries(input.attributes)) {
      const meta = memberOf(this.resource, name);
      const column = columnOf(this.table, meta.column);
      put(meta.column, writeText(this.context, column, meta, value));
    }
    for (const [name, id] of Object.entries(input.relationships)) {
      put(memberOf(this.resource, name).column, id);
    }
    if (create) {
      if (input.id !== undefined) {
        put(this.resource.names.id, input.id);
      }
      for (const [column, value] of Object.entries(input.values ?? {})) {
        const record = columnOf(this.table, column);
        put(column, writeText(this.context, record, undefined, value));
      }
      if (this.scope !== undefined) {
        put(this.scope.column, String(this.scope.value));
      }
    }
    return pairs;
  }

  /** The scope's predicate, or `true` for an unscoped resource. */
  public scoped(): string {
    if (this.scope === undefined) {
      return 'true';
    }
    const column = columnOf(this.table, this.scope.column);
    const value = this.parameters.add(String(this.scope.value), column);
    return `${quoted(this.scope.column)} = ${value}`;
  }

  /** The row's key and the scope's predicate. */
  public row(id: string): string {
    const key = this.parameters.add(
      id,
      columnOf(this.table, this.resource.names.id),
    );
    return `${quoted(this.resource.names.id)} = ${key} and ${this.scoped()}`;
  }
}
