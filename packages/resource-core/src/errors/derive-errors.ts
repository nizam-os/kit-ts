/**
 * The derived error codes of a declared resource (SPEC 9.1, 3.6): one per
 * rule key `names.rules` codes, each constraint a client can cause and see
 * and the NOT NULL key of each written member, and one per CHECK of each
 * domain a member's type passes, the code that CHECK's validator issues
 * carry too. A table constraint's items point at the public members among
 * its columns, the primary key's at `id`, and a domain CHECK's at every
 * member of the domain. The server writes the scope column (SPEC 3.2), so
 * it makes no code and no item points at it. Each code keeps its origin,
 * the constraint behind it, so a registry tells a domain two resources
 * share from two constraints that derive one code (SPEC 4.2).
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';

import type { DomainRules } from '../declare/registries';
import type { ResourceNames } from '../names/types';
import type { ErrorEntry } from './error-entry';

import { notNullKey, resolveColumnType } from '../catalog/columns';
import { ownValue } from '../internal/object';
import { deriveCode, isCode } from '../names/code';
import { domainCode } from '../schema/domain-code';
import { errorEntry } from './error-entry';

/** What the derivation reads. */
export interface ErrorSource {
  readonly catalog: PublicCatalog;
  readonly domains: DomainRules;
  readonly table: string;
  readonly tableDef: PublicTable;
  readonly names: ResourceNames;
  /** The column of the declaration's scope, which no item points at. */
  readonly scopeColumn: string | undefined;
}

/** A resource's codes and, for each, the constraint it stands for. */
export interface DerivedErrors {
  readonly errors: Readonly<Record<string, ErrorEntry>>;
  /** Code to origin: `contacts.contacts_email_unique`, or `domain email.email_check`. */
  readonly origins: ReadonlyMap<string, string>;
  /** Domain reference name to CHECK name to code, for a violation that names the domain (SPEC 9.5). */
  readonly domainChecks: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

interface Derived {
  readonly code: string;
  readonly origin: string;
  /** How a message names the constraint. */
  readonly label: string;
  readonly entry: ErrorEntry;
  /** A domain CHECK's domain and constraint. */
  readonly domain?: { readonly name: string; readonly constraint: string };
  /** Whether the definer gave the code, rather than deriving it from the constraint's name. */
  readonly given?: boolean;
}

/** The public members among `columns`, other than the scope column. */
function itemFields(
  source: ErrorSource,
  columns: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return columns.flatMap((column) =>
    column === source.scopeColumn
      ? []
      : (source.names.columns.get(column) ?? []),
  );
}

/** The codes of the table's constraints, in catalog order, then of its NOT NULL keys, in column order. */
function tableCodes(source: ErrorSource): ReadonlyArray<Derived> {
  const { table, tableDef, names } = source;
  const constraints = Object.entries(tableDef.constraints).flatMap(
    ([key, constraint]): Array<Derived> => {
      const code = names.rules.get(key);
      if (code === undefined) {
        return [];
      }
      const fields =
        constraint.kind === 'primaryKey'
          ? ['id']
          : itemFields(source, constraint.columns);
      const entry = errorEntry(constraint.kind, fields);
      return [
        { code, origin: `${table}.${key}`, label: `constraint ${key}`, entry },
      ];
    },
  );
  const notNull = Object.keys(tableDef.columns).flatMap(
    (column): Array<Derived> => {
      const key = notNullKey(tableDef, column);
      const code = names.rules.get(key);
      if (code === undefined) {
        return [];
      }
      const entry = errorEntry('notNull', itemFields(source, [column]));
      return [
        {
          code,
          origin: `${table}.${key}`,
          label: `NOT NULL key ${key}`,
          entry,
        },
      ];
    },
  );
  return [...constraints, ...notNull];
}

/** The domains each member's type passes, through arrays, each with the members that pass it; the scope column is none. */
function memberDomains(
  source: ErrorSource,
): ReadonlyMap<string, ReadonlyArray<string>> {
  const found = new Map<string, ReadonlyArray<string>>();
  for (const [column, columnDef] of Object.entries(source.tableDef.columns)) {
    const name = source.names.columns.get(column);
    if (name === undefined || column === source.scopeColumn) {
      continue;
    }
    const path = `${source.table}.${column}`;
    const { domains } = resolveColumnType(source.catalog, columnDef, path);
    for (const domain of domains) {
      found.set(domain, [...(found.get(domain) ?? []), name]);
    }
  }
  return found;
}

function domainCodes(source: ErrorSource): ReadonlyArray<Derived> {
  return [...memberDomains(source)].flatMap(([domain, fields]) => {
    const constraints = ownValue(source.catalog.domains, domain)?.constraints;
    const rules = ownValue(source.domains, domain) ?? {};
    return Object.keys(constraints ?? {}).map((constraint): Derived => {
      const rule = ownValue(rules, constraint);
      return {
        code:
          rule === undefined
            ? deriveCode(constraint)
            : domainCode(constraint, rule),
        origin: `domain ${domain}.${constraint}`,
        label: `domain ${domain}'s CHECK ${constraint}`,
        entry: errorEntry('check', fields),
        domain: { name: domain, constraint },
        given: rule?.code !== undefined,
      };
    });
  });
}

/**
 * A domain CHECK's code must match the pattern and be the resource's only
 * code of that name; the definer's `domains` can give any domain CHECK a
 * code (SPEC 3.6), and a given code matched the pattern there.
 */
function checkDomainCode(
  table: string,
  derived: Derived,
  takenBy: Derived | undefined,
): void {
  if (!isCode(derived.code)) {
    throw new TypeError(
      `${table}: ${derived.label} derives code "${derived.code}", which is not A-Z, 0-9, _; give it a code in createDeclareResource domains`,
    );
  }
  if (takenBy !== undefined) {
    throw new TypeError(
      `${table}: ${derived.label} ${derived.given === true ? 'takes' : 'derives'} code ${derived.code}, which ${takenBy.label} also takes; set code on one of them`,
    );
  }
}

/** The resource's codes: its rule keys' in `names.codes` order, then its domains' CHECKs. */
export function deriveErrors(source: ErrorSource): DerivedErrors {
  const byCode = new Map<string, Derived>();
  for (const derived of tableCodes(source)) {
    byCode.set(derived.code, derived);
  }
  for (const derived of domainCodes(source)) {
    checkDomainCode(source.table, derived, byCode.get(derived.code));
    byCode.set(derived.code, derived);
  }
  const all = [...byCode.values()];
  const domainChecks = new Map<string, Map<string, string>>();
  for (const { code, domain } of all) {
    if (domain !== undefined) {
      const checks = domainChecks.get(domain.name) ?? new Map<string, string>();
      domainChecks.set(domain.name, checks.set(domain.constraint, code));
    }
  }
  return {
    errors: Object.freeze(
      Object.fromEntries(all.map(({ code, entry }) => [code, entry])),
    ),
    origins: new Map(all.map(({ code, origin }) => [code, origin])),
    domainChecks,
  };
}
