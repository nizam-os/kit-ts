/**
 * `fields` on a declared resource (SPEC 8): the metadata of each public
 * field and relationship, keyed by public name, the fields and then the
 * relationships in declaration order. Each entry reads the member's spec,
 * the one the schemas are built from, and the declaration's own options.
 * A relationship's value is its id, which JSON:API carries as a string
 * naming a value of its key (SPEC 3.4), so its wire type is `string`.
 * Reading a relationship's target type reads the target (SPEC 3.8), so the
 * record is built on first read.
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-identification
 * @packageDocumentation
 */
import type { Operator } from '@nizam-os/keyset-core';

import type {
  Declaration,
  FieldDeclaration,
  RelationshipDeclaration,
} from '../declare/types';
import type { MemberSpec } from '../schema/field-spec';
import type { RelationshipSpec } from '../schema/relationship-specs';
import type { FieldMeta } from './types';
import type { ValueMeta } from './value-meta';

import { ownValue } from '../internal/object';
import { schemaHolds } from '../schema/object-schemas';
import { fieldDefault } from './field-default';
import { idMeta, valueMeta } from './value-meta';

/** What an entry takes from the declaration and the target, beyond the member's spec. */
interface DeclaredFacts {
  readonly kind: FieldMeta['kind'];
  readonly target: string | null;
  readonly filter: ReadonlyArray<Operator> | undefined;
  readonly sortable: boolean;
  readonly codec: string | null;
  readonly description: string | undefined;
  readonly example: unknown;
}

const NO_OPERATORS: ReadonlyArray<Operator> = Object.freeze([]);

function memberMeta(
  spec: MemberSpec,
  value: ValueMeta,
  facts: DeclaredFacts,
): FieldMeta {
  return Object.freeze({
    name: spec.name,
    column: spec.column,
    kind: facts.kind,
    access: spec.access,
    wire: value.wire,
    format: value.format,
    fractionDigits: value.fractionDigits,
    nullable: spec.nullable,
    required: schemaHolds('create', spec.access) && spec.required,
    default: fieldDefault(
      spec.default,
      spec.value,
      facts.kind === 'relationship',
    ),
    limits: value.limits,
    options: value.options,
    items: value.items,
    target: facts.target,
    filter: facts.filter ?? NO_OPERATORS,
    sortable: facts.sortable,
    codec: facts.codec,
    description: facts.description ?? null,
    example: facts.example,
  });
}

function attributeMeta(
  spec: MemberSpec,
  field: FieldDeclaration | undefined,
): FieldMeta {
  return memberMeta(spec, valueMeta(spec.value), {
    kind: 'attribute',
    target: null,
    filter: field?.filter,
    sortable: field?.sort ?? false,
    codec: field?.codec ?? null,
    description: field?.description,
    example: field?.example,
  });
}

function relationshipMeta(
  spec: RelationshipSpec,
  relationship: RelationshipDeclaration | undefined,
): FieldMeta {
  return memberMeta(spec, idMeta(spec.value), {
    kind: 'relationship',
    target: spec.target().names.type,
    filter: relationship?.filter,
    sortable: false,
    codec: null,
    description: relationship?.description,
    example: undefined,
  });
}

/** The metadata of every member, keyed by public name; reading it reads every target. */
export function fieldMetas(
  declaration: Declaration,
  fields: ReadonlyArray<MemberSpec>,
  relationships: ReadonlyArray<RelationshipSpec>,
): Readonly<Record<string, FieldMeta>> {
  const declared = declaration.relationships ?? {};
  const entries = [
    ...fields.map((spec) =>
      attributeMeta(spec, ownValue(declaration.fields, spec.column)),
    ),
    ...relationships.map((spec) =>
      relationshipMeta(spec, ownValue(declared, spec.column)),
    ),
  ];
  return Object.freeze(
    Object.fromEntries(entries.map((meta) => [meta.name, meta])),
  );
}
