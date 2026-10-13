/**
 * The levels of a column's value (SPEC 5.1, 6.1): the domains it passes
 * above the first array, outermost first, then its base type with the
 * modifiers of the level that names it, or an array whose element is a
 * level of its own. Written from the SPEC, apart from `schema/`, which the
 * property test checks against it.
 * Not published with the package.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicDomain,
  PublicTable,
  Rule,
} from '@nizam-os/catalog-core';

/** A base type or an enum, with the modifiers of the level that names it. */
export interface LevelBase {
  readonly type: string;
  readonly isEnum: boolean;
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
}

/** One level of a value. */
export interface ValueLevel {
  /** The domains of this level, outermost first. */
  readonly domains: ReadonlyArray<PublicDomain>;
  /** The base of a scalar level; `null` for an array. */
  readonly base: LevelBase | null;
  /** The element of an array level; `null` for a scalar. */
  readonly element: ValueLevel | null;
}

type TypeNode = Pick<
  PublicDomain,
  'type' | 'typeKind' | 'array' | 'maxLength' | 'precision' | 'scale'
>;

/** The levels of a value of `node`'s type: a column, a domain, or an element. */
export function levelOf(catalog: PublicCatalog, node: TypeNode): ValueLevel {
  const domains: Array<PublicDomain> = [];
  let current = node;
  for (;;) {
    if (current.array) {
      const element = levelOf(catalog, { ...current, array: false });
      return { domains, base: null, element };
    }
    if (current.typeKind !== 'domain') {
      const { type, maxLength, precision, scale } = current;
      const isEnum = current.typeKind === 'enum';
      return {
        domains,
        base: { type, isEnum, maxLength, precision, scale },
        element: null,
      };
    }
    const domain = catalog.domains[current.type]!;
    domains.push(domain);
    current = domain;
  }
}

/** The rules of a level's domains, outermost first (SPEC 6.1 step 2). */
export function domainRules(level: ValueLevel): Array<Rule> {
  return level.domains.flatMap((domain) =>
    Object.values(domain.constraints).flatMap(({ rule }) =>
      rule === null ? [] : [rule],
    ),
  );
}

/** The rules of the table's enforced CHECKs over exactly `column` (SPEC 6.1 step 3). */
export function columnRules(table: PublicTable, column: string): Array<Rule> {
  return Object.values(table.constraints).flatMap((constraint) =>
    constraint.kind === 'check' &&
    constraint.enforced &&
    constraint.rule !== null &&
    constraint.columns.length === 1 &&
    constraint.columns[0] === column
      ? [constraint.rule]
      : [],
  );
}

/** Every domain a value passes: directly, through a base domain, or as an element (SPEC 9.1). */
export function domainsPassed(level: ValueLevel): Array<PublicDomain> {
  return [
    ...level.domains,
    ...(level.element === null ? [] : domainsPassed(level.element)),
  ];
}
