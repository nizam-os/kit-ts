/**
 * The spec of each declared field (SPEC 6.1, 6.3): its value through the
 * five steps, whether it takes `null`, and whether a create must carry it.
 * Built once per declaration; the object schemas, the linkage schemas, and
 * the field metadata read it.
 * @packageDocumentation
 */
import type {
  PublicCheckConstraint,
  PublicColumn,
  PublicColumnDefault,
  PublicTable,
} from '@nizam-os/catalog-core';

import type { DefinerContext } from '../declare/check-config';
import type { Access, Declaration } from '../declare/types';
import type { ResourceNames } from '../names/types';
import type { ValidatorUse, ValueSpec } from './value-form';
import type { SpecContext, ValueLevel } from './value-spec';

import { ownValue } from '../internal/object';
import { deriveCode } from '../names/code';
import { domainCode } from './domain-code';
import { NO_LIMITS } from './limits';
import { levelOf, withRule } from './value-spec';

/** What every member of a declared table needs: its value, nullability, default, and requirement. */
export interface MemberSpec {
  readonly name: string;
  readonly column: string;
  readonly access: Access;
  readonly value: ValueSpec;
  /** Effectively nullable (SPEC 6.1 step 4). */
  readonly nullable: boolean;
  /** The default PostgreSQL applies: the column's, else the nearest domain's above the first array. */
  readonly default: PublicColumnDefault | null;
  /** Required on insert (SPEC 6.3). */
  readonly required: boolean;
}

/** The catalog and the declaration a resource's specs are built from. */
export interface SpecSource {
  readonly context: DefinerContext;
  readonly table: string;
  readonly tableDef: PublicTable;
  readonly declaration: Declaration;
  readonly names: ResourceNames;
}

/** The definer's validators for domain CHECKs, as uses with their codes. */
function specContext(context: DefinerContext): SpecContext {
  return {
    catalog: context.catalog,
    domainValidator: (domain, constraint) => {
      const rule = ownValue(
        ownValue(context.domains, domain) ?? {},
        constraint,
      );
      const name = rule?.validator;
      const validator =
        name === undefined ? undefined : ownValue(context.validators, name);
      return rule === undefined || name === undefined || validator === undefined
        ? undefined
        : {
            name,
            validator,
            code: domainCode(constraint, rule),
            check: { domain, constraint },
          };
    },
  };
}

/** The table's enforced CHECKs over exactly this column (SPEC 6.1 step 3); PostgreSQL never applies a NOT ENFORCED one, so neither does the schema. */
function columnChecks(
  tableDef: PublicTable,
  column: string,
): ReadonlyArray<readonly [string, PublicCheckConstraint]> {
  return Object.entries(tableDef.constraints).filter(
    (entry): entry is [string, PublicCheckConstraint] => {
      const [, constraint] = entry;
      return (
        constraint.kind === 'check' &&
        constraint.enforced &&
        constraint.columns.length === 1 &&
        constraint.columns[0] === column
      );
    },
  );
}

/** The validator a declaration names for a CHECK, with the code the resource derives for it. */
function declaredValidator(
  source: SpecSource,
  constraint: string,
): ValidatorUse | undefined {
  const name = ownValue(source.declaration.rules ?? {}, constraint)?.validator;
  const validator =
    name === undefined ? undefined : ownValue(source.context.validators, name);
  return name === undefined || validator === undefined
    ? undefined
    : {
        name,
        validator,
        code: source.names.rules.get(constraint) ?? deriveCode(constraint),
        check: { domain: null, constraint },
      };
}

/**
 * The column's own CHECKs folded into its top level: rules unless a codec
 * owns the representation, `notNull`, and the validators the declaration
 * names for CHECKs without a rule.
 */
function withColumnChecks(
  source: SpecSource,
  column: string,
  level: ValueLevel,
  codec: boolean,
): ValueLevel {
  let { spec, notNull } = level;
  const validators: Array<ValidatorUse> = [];
  for (const [name, { rule }] of columnChecks(source.tableDef, column)) {
    if (rule === null) {
      const use = declaredValidator(source, name);
      if (use !== undefined) {
        validators.push(use);
      }
    } else if (rule.kind === 'notNull') {
      notNull = true;
    } else if (!codec) {
      spec = withRule(spec, rule, `${source.table}.${column}: CHECK ${name}`);
    }
  }
  return {
    spec: { ...spec, validators: [...spec.validators, ...validators] },
    notNull,
    default: level.default,
  };
}

/** A codec column's level: the codec's schema, with the domains' NOT NULL, defaults, and validators above it. */
function codecLevel(
  source: SpecSource,
  column: PublicColumn,
  codecName: string,
): ValueLevel {
  const codec = ownValue(source.context.codecs, codecName);
  if (codec === undefined) {
    throw new TypeError(
      `${source.table}: codec ${codecName} is not in the definer`,
    );
  }
  const facts = domainFacts(source.context, column);
  return {
    spec: {
      form: { kind: 'codec', name: codecName, codec },
      limits: NO_LIMITS,
      options: null,
      validators: facts.validators,
    },
    notNull: facts.notNull,
    default: facts.default,
  };
}

interface DomainFacts {
  readonly notNull: boolean;
  readonly default: PublicColumnDefault | null;
  readonly validators: ReadonlyArray<ValidatorUse>;
}

/** NOT NULL, the nearest default, and the validators of the domains above a column's first array. */
function domainFacts(
  context: DefinerContext,
  column: PublicColumn,
): DomainFacts {
  const lookup = specContext(context);
  const validators: Array<ValidatorUse> = [];
  let notNull = false;
  let nearest: PublicColumnDefault | null = null;
  let record: Pick<PublicColumn, 'type' | 'typeKind' | 'array'> = column;
  while (!record.array && record.typeKind === 'domain') {
    const name = record.type;
    const domain = ownValue(context.catalog.domains, name);
    if (domain === undefined) {
      break;
    }
    notNull ||= !domain.nullable;
    nearest ??= domain.default;
    for (const [constraint, { rule }] of Object.entries(domain.constraints)) {
      notNull ||= rule?.kind === 'notNull';
      const use =
        rule === null ? lookup.domainValidator(name, constraint) : undefined;
      if (use !== undefined) {
        validators.push(use);
      }
    }
    record = domain;
  }
  return { notNull, default: nearest, validators };
}

/** The spec of one member column, read by fields and relationships alike. */
export function memberSpec(
  source: SpecSource,
  member: {
    readonly column: string;
    readonly name: string;
    readonly access: Access;
  },
  codec?: string,
): MemberSpec {
  const columnDef = ownValue(source.tableDef.columns, member.column);
  if (columnDef === undefined) {
    throw new TypeError(`${source.table}: "${member.column}" is not a column`);
  }
  const path = `${source.table}.${member.column}`;
  const base =
    codec === undefined
      ? levelOf(specContext(source.context), columnDef, path)
      : codecLevel(source, columnDef, codec);
  const level = withColumnChecks(
    source,
    member.column,
    base,
    codec !== undefined,
  );
  const nullable = columnDef.nullable && !level.notNull;
  const applied = columnDef.default ?? level.default;
  return {
    ...member,
    value: level.spec,
    nullable,
    default: applied,
    required:
      !nullable &&
      applied === null &&
      columnDef.identity === null &&
      columnDef.generated === null,
  };
}

/** The spec of every declared field, in declaration order. */
export function fieldSpecs(source: SpecSource): ReadonlyArray<MemberSpec> {
  return Object.entries(source.declaration.fields).map(([column, field]) =>
    memberSpec(
      source,
      {
        column,
        name: source.names.columns.get(column) ?? column,
        access: field.access,
      },
      field.codec,
    ),
  );
}
