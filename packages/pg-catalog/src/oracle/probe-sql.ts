/**
 * The SQL of the oracle's probes (SPEC 10.3). A probe is a temporary table
 * holding copies of a case's columns, each of the column's own type and
 * collation, with its NOT NULL when the case keeps it, and the CHECKs the
 * case names, each over the expression PostgreSQL deparsed; or a column of
 * a domain, which brings the domain's CHECKs and NOT NULL. `ATTEMPT_FUNCTION` writes each fixture
 * into it in a subtransaction of its own and catches what PostgreSQL
 * raises, so a refusal never reaches the client and a case's fixtures take
 * one round trip. Every query returns one `json_agg(...)::text` value, as
 * extraction's do (SPEC 7.2).
 * @ref https://www.postgresql.org/docs/18/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING
 * @ref https://www.postgresql.org/docs/18/functions-string.html#FUNCTIONS-STRING-FORMAT
 * @packageDocumentation
 */

/** The probe, by its qualified name; `pg_temp` holds it, so no migration's object can share it. */
export const PROBE_TABLE = 'pg_temp.nizam_probe';

/** Creates the probe with column and constraint `definitions`. */
export function createProbe(definitions: ReadonlyArray<string>): string {
  return `create temporary table nizam_probe (${definitions.join(', ')})`;
}

/**
 * Writes each fixture of `fixtures`, a JSON array of arrays of texts (or
 * `null`), through `template`, an `INSERT` whose `%L` placeholders
 * `format` fills with the texts as quoted literals, so PostgreSQL reads
 * each with the column's input function and assignment semantics, as it
 * reads an untyped parameter. It returns, in order, the texts the
 * `RETURNING` clause gave back, or the SQLSTATE and the constraint the
 * error named (an empty `CONSTRAINT_NAME` is none). PostgreSQL never
 * looks up a function in `pg_temp` by an unqualified name, so it is called
 * by its qualified one.
 * @ref https://www.postgresql.org/docs/18/runtime-config-client.html#GUC-SEARCH-PATH
 * @ref https://www.postgresql.org/docs/18/plpgsql-control-structures.html#PLPGSQL-EXCEPTION-DIAGNOSTICS
 */
export const ATTEMPT_FUNCTION = `create or replace function pg_temp.nizam_attempt(template text, fixtures json)
returns json
language plpgsql
as $attempt$
declare
  texts text[];
  stored text[];
  state text;
  refused_by text;
  verdicts json[] := '{}';
begin
  for texts in
    select array(
      select e.value from json_array_elements_text(f.value) with ordinality as e(value, position)
      order by e.position
    )
    from json_array_elements(fixtures) with ordinality as f(value, position)
    order by f.position
  loop
    begin
      execute format(template, variadic texts) into stored;
      verdicts := verdicts || json_build_object('accepted', true, 'stored', stored);
    exception when others then
      get stacked diagnostics state = returned_sqlstate, refused_by = constraint_name;
      verdicts := verdicts || json_build_object(
        'accepted', false, 'code', state, 'constraint', nullif(refused_by, '')
      );
    end;
  end loop;
  return array_to_json(verdicts);
end
$attempt$`;

/** Runs the attempt function: $1 the template, $2 the fixtures' texts as JSON. */
export const ATTEMPT_QUERY =
  'select pg_temp.nizam_attempt($1, $2::json)::text as verdicts';

/**
 * The columns of the table `$1.$2` named in `$3`, in `attnum` order, each
 * with its type as `format_type` prints it, its collation when it is not
 * the type's, qualified, and its NOT NULL; and the table's CHECKs named in
 * `$4`, each with `pg_get_expr(conbin, conrelid)`.
 */
export const PROBE_SOURCE_QUERY = `with source as (
  select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = $1 and c.relname = $2
)
select
  (select coalesce(json_agg(json_build_object(
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'collation', case when a.attcollation <> 0 and a.attcollation <> t.typcollation
        then quote_ident(cn.nspname) || '.' || quote_ident(co.collname) end,
      'notNull', a.attnotnull
    ) order by a.attnum), '[]')
   from pg_attribute a
   join pg_type t on t.oid = a.atttypid
   left join pg_collation co on co.oid = a.attcollation
   left join pg_namespace cn on cn.oid = co.collnamespace
   where a.attrelid = (select oid from source) and a.attnum > 0
     and not a.attisdropped and a.attname = any($3::text[]))::text as columns,
  (select coalesce(json_agg(json_build_object(
      'name', k.conname,
      'expression', pg_get_expr(k.conbin, k.conrelid)
    ) order by k.conname), '[]')
   from pg_constraint k
   where k.conrelid = (select oid from source) and k.contype = 'c'
     and k.conname = any($4::text[]))::text as checks`;

/** `name` as a quoted identifier. */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * The template that writes one fixture into the probe's `columns`: an
 * identifier's `%` is doubled, since `format` reads the template.
 */
export function insertTemplate(columns: ReadonlyArray<string>): string {
  const names = columns.map((column) =>
    quoteIdentifier(column).replaceAll('%', '%%'),
  );
  return `insert into ${PROBE_TABLE} (${names.join(', ')}) values (${names.map(() => '%L').join(', ')}) returning array[${names.map((name) => `${name}::text`).join(', ')}]`;
}
