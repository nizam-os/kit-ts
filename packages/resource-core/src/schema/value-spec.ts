/**
 * What a value must be (SPEC 6.1 steps 1 and 2): a column's type followed
 * through its domains, with each type's wire form and bounds and each
 * domain's rules and validators folded in at the level they apply to. A
 * domain reached through an array applies to every element; a domain over
 * an array applies to the array. Only the domains above the first array
 * decide the column's nullability and default (SPEC 6.3), and the nearest
 * of their defaults is the one PostgreSQL applies: a domain's default
 * overrides its underlying type's.
 * @ref https://www.postgresql.org/docs/18/sql-createdomain.html
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumnDefault,
  Rule,
} from '@nizam-os/catalog-core';

import type {
  TypeRecord,
  ValidatorUse,
  ValueForm,
  ValueSpec,
} from './value-form';

import { ownValue } from '../internal/object';
import { withLength, withPattern, withRange } from './limits';
import { baseSpec, specOf } from './value-form';

/** A level of a column's type: its spec, and what its domains say about the whole value. */
export interface ValueLevel {
  readonly spec: ValueSpec;
  /** A NOT NULL domain or a `notNull` rule above the first array. */
  readonly notNull: boolean;
  /** The nearest domain default above the first array, or `null`. */
  readonly default: PublicColumnDefault | null;
}

/** What a level reads besides the catalog: the definer's validators for domain CHECKs. */
export interface SpecContext {
  readonly catalog: PublicCatalog;
  readonly domainValidator: (
    domain: string,
    constraint: string,
  ) => ValidatorUse | undefined;
}

function baseLevel(record: TypeRecord, path: string): ValueLevel {
  const spec = baseSpec(record);
  if (spec === undefined) {
    throw new TypeError(`${path}: type ${record.type} has no wire form`);
  }
  return { spec, notNull: false, default: null };
}

function enumLevel(
  context: SpecContext,
  type: string,
  path: string,
): ValueLevel {
  const labels = ownValue(context.catalog.enums, type);
  if (labels === undefined) {
    throw new TypeError(`${path}: enum ${type} is not in the catalog`);
  }
  return {
    spec: { ...specOf({ kind: 'enum', type }), options: labels },
    notNull: false,
    default: null,
  };
}

function intersect(
  options: ReadonlyArray<string> | null,
  values: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return options === null
    ? values
    : options.filter((option) => values.includes(option));
}

function isTextual(form: ValueForm): boolean {
  return (
    form.kind === 'text' && (form.type === 'text' || form.type === 'varchar')
  );
}

function isNumeric(form: ValueForm): boolean {
  return form.kind === 'number' || form.kind === 'decimal';
}

/**
 * Folds a rule other than `notNull` into a spec. The recognizer emits each
 * kind only for the types it applies to (catalog SPEC 8.3), so another
 * pairing can only come from a hand-edited catalog.
 */
export function withRule(
  spec: ValueSpec,
  rule: Exclude<Rule, { kind: 'notNull' }>,
  where: string,
): ValueSpec {
  const { form } = spec;
  if (rule.kind === 'enum' && (isTextual(form) || form.kind === 'enum')) {
    return { ...spec, options: intersect(spec.options, rule.values) };
  }
  if (rule.kind === 'length' && isTextual(form)) {
    return { ...spec, limits: withLength(spec.limits, rule) };
  }
  if (rule.kind === 'pattern' && isTextual(form)) {
    return { ...spec, limits: withPattern(spec.limits, rule.source) };
  }
  if (rule.kind === 'range' && isNumeric(form)) {
    return { ...spec, limits: withRange(spec.limits, rule) };
  }
  throw new TypeError(
    `${where}: a ${rule.kind} rule does not apply to this type`,
  );
}

function domainLevel(
  context: SpecContext,
  name: string,
  path: string,
): ValueLevel {
  const domain = ownValue(context.catalog.domains, name);
  if (domain === undefined) {
    throw new TypeError(`${path}: domain ${name} is not in the catalog`);
  }
  const inner = levelOf(context, domain, path);
  let { spec } = inner;
  let notNull = inner.notNull || !domain.nullable;
  const validators: Array<ValidatorUse> = [];
  for (const [constraint, { rule }] of Object.entries(domain.constraints)) {
    if (rule === null) {
      const use = context.domainValidator(name, constraint);
      if (use !== undefined) {
        validators.push(use);
      }
    } else if (rule.kind === 'notNull') {
      notNull = true;
    } else {
      spec = withRule(
        spec,
        rule,
        `${path}: domain ${name}'s CHECK ${constraint}`,
      );
    }
  }
  return {
    spec: { ...spec, validators: [...spec.validators, ...validators] },
    notNull,
    default: domain.default ?? inner.default,
  };
}

function scalarLevel(
  context: SpecContext,
  record: TypeRecord,
  path: string,
): ValueLevel {
  if (record.typeKind === 'domain') {
    return domainLevel(context, record.type, path);
  }
  if (record.typeKind === 'enum') {
    return enumLevel(context, record.type, path);
  }
  if (record.typeKind === 'base') {
    return baseLevel(record, path);
  }
  throw new TypeError(`${path}: type ${record.type} has no wire form`);
}

/**
 * The level of a type record, a column or a domain. A domain that refers to
 * itself cannot reach here: `resolveColumnType` refuses it when the
 * declaration is checked.
 */
export function levelOf(
  context: SpecContext,
  record: TypeRecord,
  path: string,
): ValueLevel {
  if (!record.array) {
    return scalarLevel(context, record, path);
  }
  const element = scalarLevel(context, { ...record, array: false }, path);
  return {
    spec: specOf({ kind: 'array', element: element.spec }),
    notNull: false,
    default: null,
  };
}
