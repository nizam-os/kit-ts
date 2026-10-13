/**
 * The codes a declared resource must carry (SPEC 9.1): one per enforced
 * constraint over a public member other than the scope column, the
 * primary key with client ids, the NOT NULL key of each writable member
 * NOT NULL in the catalog, and each CHECK of each domain a member's type
 * passes, at any level; each named by its key or domain CHECK upper-cased
 * unless a code is given.
 * Not published with the package.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';

import { domainsPassed, levelOf } from './value-levels';

/** A public member as the codes see it. */
interface CodeMember {
  readonly column: string;
  readonly name: string;
  readonly writable: boolean;
}

/** What decides a resource's codes. */
export interface CodeInput {
  readonly catalog: PublicCatalog;
  readonly table: PublicTable;
  readonly members: ReadonlyArray<CodeMember>;
  /** The declared scope's column, which makes no code. */
  readonly scopeColumn: string | null;
  readonly clientIds: boolean;
  /** Codes the declaration's `rules` give, by rule key. */
  readonly ruleCodes: Readonly<Record<string, string>>;
  /** Codes the definer's `domains` give, by domain and constraint. */
  readonly domainCodes: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}

/** One expected code; `key` is its rule key, or `<domain>.<constraint>`; `fields` sorted. */
export interface ModelCode {
  readonly key: string;
  readonly code: string;
  readonly kind: string;
  readonly status: number;
  readonly fields: ReadonlyArray<string>;
}

const STATUS: Readonly<Record<string, number>> = {
  check: 422,
  notNull: 422,
  unique: 409,
  primaryKey: 409,
  exclusion: 409,
  foreignKey: 404,
};

/** An expected code: the given one, else `name` upper-cased (SPEC 4.1, 3.6). */
function code(
  key: string,
  name: string,
  kind: string,
  fields: ReadonlyArray<string>,
  given: string | undefined,
): ModelCode {
  const sorted = [...fields].toSorted();
  return {
    key,
    code: given ?? name.toUpperCase(),
    kind,
    status: STATUS[kind]!,
    fields: sorted,
  };
}

function constraintCodes(
  input: CodeInput,
  named: ReadonlyMap<string, CodeMember>,
): Array<ModelCode> {
  return Object.entries(input.table.constraints).flatMap(
    ([key, constraint]) => {
      if (constraint.kind === 'primaryKey') {
        return input.clientIds
          ? [code(key, key, 'primaryKey', ['id'], input.ruleCodes[key])]
          : [];
      }
      if (
        (constraint.kind === 'check' || constraint.kind === 'foreignKey') &&
        !constraint.enforced
      ) {
        return [];
      }
      const members = constraint.columns.flatMap((column) => {
        const member =
          column === input.scopeColumn ? undefined : named.get(column);
        return member === undefined ? [] : [member.name];
      });
      return members.length === 0
        ? []
        : [code(key, key, constraint.kind, members, input.ruleCodes[key])];
    },
  );
}

function notNullCodes(
  input: CodeInput,
  named: ReadonlyMap<string, CodeMember>,
): Array<ModelCode> {
  return Object.entries(input.table.columns).flatMap(([column, definition]) => {
    const member = named.get(column);
    if (
      definition.nullable ||
      member === undefined ||
      !member.writable ||
      column === input.scopeColumn
    ) {
      return [];
    }
    const key = `${input.table.name}_${column}_not_null`;
    return [code(key, key, 'notNull', [member.name], input.ruleCodes[key])];
  });
}

function domainCodes(
  input: CodeInput,
  named: ReadonlyMap<string, CodeMember>,
): Array<ModelCode> {
  const passedBy = new Map<string, Set<string>>();
  for (const [column, member] of named) {
    if (column === input.scopeColumn) {
      continue;
    }
    for (const domain of domainsPassed(
      levelOf(input.catalog, input.table.columns[column]!),
    )) {
      passedBy.set(
        domain.name,
        (passedBy.get(domain.name) ?? new Set()).add(member.name),
      );
    }
  }
  return [...passedBy].flatMap(([domain, members]) =>
    Object.keys(input.catalog.domains[domain]!.constraints).map((constraint) =>
      code(
        `${domain}.${constraint}`,
        constraint,
        'check',
        [...members],
        input.domainCodes[domain]?.[constraint],
      ),
    ),
  );
}

/** Every code the resource must carry. */
export function expectedCodes(input: CodeInput): Array<ModelCode> {
  const named = new Map(input.members.map((member) => [member.column, member]));
  return [
    ...constraintCodes(input, named),
    ...notNullCodes(input, named),
    ...domainCodes(input, named),
  ];
}
