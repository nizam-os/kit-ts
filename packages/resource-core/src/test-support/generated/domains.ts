/**
 * Generated domains (SPEC 15.2): over a base type with its modifiers, over
 * an enum, over another domain, and over an array of either, each NOT NULL
 * or not, with or without a default, and with up to two CHECKs, which
 * carry a rule the recognizer could read or none.
 * Not published with the package.
 * @packageDocumentation
 */
import type {
  PublicDomain,
  PublicDomainConstraint,
} from '@nizam-os/catalog-core';

import type { Random } from './random';
import type { RuleSubject } from './rules';
import type { TypeRef } from './type-refs';

import { letters } from './naming';
import { ruleFor } from './rules';
import {
  baseRef,
  domainRef,
  enumRef,
  JSON_BASES,
  SCALAR_BASES,
} from './type-refs';

/** The enums and domains generated so far, which later types may name. */
export interface TypeScope {
  readonly enums: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly domains: Readonly<Record<string, PublicDomain>>;
}

const MAX_DOMAINS = 6;
const MAX_CHECKS = 2;

/** The rules a value of `ref` can carry: its base type's, through its domains. */
export function subjectOf(
  scope: TypeScope,
  ref: Pick<TypeRef, 'type' | 'typeKind'>,
  array: boolean,
): RuleSubject {
  let current: Pick<PublicDomain, 'type' | 'typeKind' | 'array'> = {
    ...ref,
    array,
  };
  while (current.typeKind === 'domain' && !current.array) {
    current = scope.domains[current.type]!;
  }
  return {
    base: current.type,
    isEnum: current.typeKind === 'enum',
    labels: scope.enums[current.type] ?? [],
    array: current.array,
  };
}

/** The scalar domains of `scope`: the ones a chain or an array may name. */
function scalarDomains(scope: TypeScope): Array<PublicDomain> {
  return Object.values(scope.domains).filter(({ array }) => !array);
}

/**
 * The scalar domains an array may hold: none over `json` or `jsonb`, whose
 * arrays have no wire form (SPEC 5.1).
 */
export function elementDomains(scope: TypeScope): Array<PublicDomain> {
  const json: ReadonlyArray<string> = JSON_BASES;
  return scalarDomains(scope).filter(
    (domain) => !json.includes(subjectOf(scope, domainRef(domain), false).base),
  );
}

function domainType(
  random: Random,
  scope: TypeScope,
  kind: 'scalar' | 'enum' | 'chain' | 'array',
): TypeRef {
  const scalars =
    kind === 'array' ? elementDomains(scope) : scalarDomains(scope);
  const labelled = Object.keys(scope.enums);
  if (
    (kind === 'chain' || kind === 'array') &&
    scalars.length > 0 &&
    random.chance(0.6)
  ) {
    return domainRef(random.pick(scalars));
  }
  if (kind === 'enum' && labelled.length > 0) {
    return enumRef(random.pick(labelled));
  }
  const bases =
    kind === 'array' ? SCALAR_BASES : [...SCALAR_BASES, ...JSON_BASES];
  return baseRef(random, random.pick(bases));
}

function domainChecks(
  random: Random,
  name: string,
  subject: RuleSubject,
): Record<string, PublicDomainConstraint> {
  const checks: Record<string, PublicDomainConstraint> = {};
  const count = random.int(0, MAX_CHECKS);
  for (let index = 0; index < count; index += 1) {
    checks[index === 0 ? `${name}_check` : `${name}_check_b`] = {
      kind: 'check',
      rule: random.chance(0.2) ? null : ruleFor(random, subject),
    };
  }
  return checks;
}

/** Up to six domains over `enums`, each free to name the ones before it. */
export function generateDomains(
  random: Random,
  enums: TypeScope['enums'],
): Record<string, PublicDomain> {
  const domains: Record<string, PublicDomain> = {};
  const count = random.int(0, MAX_DOMAINS);
  for (let index = 0; index < count; index += 1) {
    const name = `dom_${letters(index)}`;
    const scope = { enums, domains };
    const kind = random.pick([
      'scalar',
      'scalar',
      'enum',
      'chain',
      'array',
    ] as const);
    const ref = domainType(random, scope, kind);
    const array = kind === 'array';
    domains[name] = {
      schema: 'public',
      name,
      type: ref.type,
      typeKind: ref.typeKind,
      array,
      sqlType: array ? `${ref.sqlType}[]` : ref.sqlType,
      maxLength: ref.maxLength,
      precision: ref.precision,
      scale: ref.scale,
      nullable: random.chance(0.8),
      default: random.chance(0.3) ? { literal: null } : null,
      constraints: domainChecks(random, name, subjectOf(scope, ref, array)),
    };
  }
  return domains;
}
