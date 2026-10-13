/**
 * Resource ids against PostgreSQL (resource SPEC 3.4). For each key table
 * of the oracle's schema and candidate texts of its type, `schema.id`
 * takes a text exactly when PostgreSQL stores it as a value with a read
 * form, and outputs the text a driver reads back for that value, which it
 * takes as itself; it refuses a text only when PostgreSQL refuses it or
 * reads it back otherwise. A lookup by every id it takes runs without an
 * error, and two ids it outputs differently name two keys, except where
 * the key's type compares more coarsely than any spelling (`citext`, a
 * `numeric` without a scale). PostgreSQL reads each text as an untyped
 * literal quoted by `format` on the server, a query parameter's input
 * path: PGlite serializes a typed parameter on the client, so a boolean's
 * `yes` would reach the server as `t`. A `bpchar` reads back through
 * `format('%s')`, which keeps the padding a driver reads and `::text`
 * drops. Runs on PGlite, and on the server `RESOURCE_PG_URL` names.
 * @ref https://www.postgresql.org/docs/18/functions-string.html#FUNCTIONS-STRING-FORMAT
 * @ref https://www.postgresql.org/docs/18/datatype-character.html
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { OracleDatabase } from './support/oracle-database.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { columnType } from './support/column-type.ts';
import { idCandidates } from './support/id-candidates.ts';
import { oracleDatabases } from './support/oracle-database.ts';
import { KEYS, publicCatalog } from './support/oracle-resources.ts';
import { readForm } from './support/read-form.ts';

const catalog: PublicCatalog = publicCatalog;
/** The key tables whose type compares more coarsely than any spelling. */
const COARSE: ReadonlySet<string> = new Set(['key_names', 'key_amounts']);

/** Runs a statement and answers its one value, or its SQLSTATE; `undo` rolls the statement back. */
const ATTEMPT = `create or replace function pg_temp.attempt(statement text, undo boolean, out value text, out code text) language plpgsql as $$
begin
  begin
    execute statement into value;
    if undo then
      raise exception using errcode = 'XX001', message = 'undo';
    end if;
  exception when sqlstate 'XX001' then null;
  end;
exception when others then code := sqlstate;
end $$`;

type Key = (typeof KEYS)[number];

interface Outcome {
  readonly value: string | null;
  readonly code: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function sqlState(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'unknown';
}

/** Runs `template` with `%L` replaced by `literal`; a parameter the server refuses (U+0000) gives its SQLSTATE. */
async function attempt(
  database: OracleDatabase,
  template: string,
  literal: string,
  undo: boolean,
): Promise<Outcome> {
  try {
    const [row] = await database.query(
      'select value, code from pg_temp.attempt(format($1::text, $2::text), $3::boolean)',
      [template, literal, String(undo)],
    );
    return { value: text(row?.['value']), code: text(row?.['code']) };
  } catch (error) {
    return { value: null, code: sqlState(error) };
  }
}

/** An id as the server sends it: the read form's string, or a number's or a boolean's text. */
function idText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

const shown = (value: string | undefined): string => JSON.stringify(value);

interface Findings {
  readonly problems: ReadonlyArray<string>;
  /** Pairs of ids `schema.id` outputs differently that PostgreSQL holds equal. */
  readonly equal: ReadonlyArray<string>;
}

/** The candidates' verdicts on one key table, against PostgreSQL. */
async function check(
  database: OracleDatabase,
  resource: Key,
): Promise<Findings> {
  const { table } = resource;
  const definition = catalog.tables[table]?.columns['id'];
  if (definition === undefined) {
    throw new Error(`${table} has no id column`);
  }
  const type = columnType(catalog, definition);
  const read = type.base === 'bpchar' ? `format('%%s', "id")` : `"id"::text`;
  const labels = type.enum ? catalog.enums[type.base] : undefined;
  const problems: Array<string> = [];
  const outputs = new Set<string>();
  for (const candidate of idCandidates(type.base, labels)) {
    const parsed = resource.schema.id.safeParse(candidate);
    const stored = await attempt(
      database,
      `insert into "${table}" ("id") values (%L) returning ${read}`,
      candidate,
      true,
    );
    const sent =
      stored.value === null ? undefined : idText(readForm(stored.value, type));
    if (parsed.success) {
      outputs.add(parsed.data);
      if (sent !== parsed.data) {
        problems.push(
          `takes ${shown(candidate)} as ${shown(parsed.data)}; PostgreSQL ${stored.code ?? `reads ${shown(sent)}`}`,
        );
      }
      const found = await attempt(
        database,
        `select 'found' from "${table}" where "id" = %L`,
        candidate,
        false,
      );
      if (found.code !== null) {
        problems.push(
          `a lookup by ${shown(candidate)} fails with ${found.code}`,
        );
      }
    } else if (sent === candidate) {
      problems.push(`refuses ${shown(candidate)}, an id the server sends`);
    }
    if (
      sent !== undefined &&
      resource.schema.id.safeParse(sent).data !== sent
    ) {
      problems.push(
        `does not take ${shown(sent)}, an id the server sends, as itself`,
      );
    }
  }
  const pairs = await attempt(
    database,
    `with ids as (select id, n from jsonb_array_elements_text(%L::jsonb) with ordinality ids (id, n))
     select coalesce(string_agg(format('%%s = %%s', to_jsonb(a.id), to_jsonb(b.id)), '; '), '')
     from ids a join ids b on a.n < b.n and a.id::${definition.sqlType} = b.id::${definition.sqlType}`,
    JSON.stringify([...outputs]),
    false,
  );
  if (pairs.code !== null) {
    problems.push(`comparing the ids fails with ${pairs.code}`);
  }
  const equal =
    pairs.value === null || pairs.value === '' ? [] : pairs.value.split('; ');
  return { problems, equal };
}

describe.each(oracleDatabases())(
  'resource ids on %s (SPEC 3.4)',
  (_label, open) => {
    let database: OracleDatabase;

    beforeAll(async () => {
      database = await open();
    });

    afterAll(async () => {
      await database.close();
    });

    it.each(KEYS.map((resource) => [resource.table, resource] as const))(
      '%s: takes what PostgreSQL stores, outputs what a driver reads back, and looks it up',
      async (table, resource) => {
        // Before each table: PGlite replaced after its error budget holds no temporary function.
        await database.query(ATTEMPT);
        const { problems, equal } = await check(database, resource);
        expect(problems).toEqual([]);
        // Two ids name one key only where the type compares more coarsely than any spelling.
        expect(equal.length > 0).toBe(COARSE.has(table));
      },
    );
  },
);
