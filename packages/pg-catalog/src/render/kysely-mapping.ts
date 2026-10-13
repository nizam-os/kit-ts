/**
 * The type tables of SPEC 9.2: the TypeScript types of a column in Kysely's
 * select, insert, and update positions, as the configured driver returns
 * and sends its values (ADR 0007, ADR 0013), after the overrides.
 * PostgreSQL describes a domain column with its base type's OID, so a
 * domain reads as its base type; how its parameter is sent is the
 * driver's.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/common/printtup.c (SendRowDescriptionMessage sends getBaseType)
 * @packageDocumentation
 */
import type { Catalog } from '@nizam-os/catalog-core';

import type { KyselyDriver } from '../config';
import type {
  DriverTable,
  PositionTypes,
  Scalar,
  TypeRef,
} from './kysely-type-table';

import { NODE_POSTGRES_TYPES } from './kysely-node-postgres';
import { PGLITE_TYPES } from './kysely-pglite';
import { positions, same, TEXT } from './kysely-type-table';

/** What the mapping reads besides the type. */
export interface MappingContext {
  readonly catalog: Catalog;
  /** The TypeScript name of each enum, by reference name. */
  readonly enumNames: ReadonlyMap<string, string>;
  /** `types.overrides` by type key (`int8`, `int8[]`). */
  readonly overrides: ReadonlyMap<string, PositionTypes>;
  /** `types.driver`. */
  readonly driver: KyselyDriver;
}

const TABLES: Readonly<Record<KyselyDriver, DriverTable>> = {
  'node-postgres': NODE_POSTGRES_TYPES,
  pglite: PGLITE_TYPES,
};
/** A domain whose definition lies outside the configured schemas: its base type is not known. */
const UNKNOWN = positions(same('unknown'));

function scalarOf(ref: TypeRef, context: MappingContext): Scalar {
  if (ref.typeKind === 'enum') {
    const name = context.enumNames.get(ref.type);
    // An enum outside the configured schemas is still returned as its label.
    return name === undefined ? TEXT : same(name);
  }
  return ref.typeKind === 'base'
    ? (TABLES[context.driver].scalars.get(ref.type) ?? TEXT)
    : TEXT;
}

/**
 * The override nearest to `ref` along its domain chain, or the type the
 * chain ends at; `undefined` for a domain defined outside the catalog.
 */
function resolve(
  ref: TypeRef,
  context: MappingContext,
): PositionTypes | TypeRef | undefined {
  const override = context.overrides.get(
    ref.array ? `${ref.type}[]` : ref.type,
  );
  if (override !== undefined) {
    return override;
  }
  if (ref.typeKind !== 'domain' || ref.array) {
    return ref;
  }
  const domain = context.catalog.domains[ref.type];
  return domain === undefined ? undefined : resolve(domain, context);
}

function typesOf(ref: TypeRef, context: MappingContext): PositionTypes {
  if (!ref.array) {
    return positions(scalarOf(ref, context));
  }
  const element = mapType({ ...ref, array: false }, context);
  return TABLES[context.driver].array(ref, element);
}

/**
 * The three types of a column or domain of type `ref`. An override for the
 * type's key (`<type>`, or `<type>[]` for an array) wins; a domain resolves
 * to its base type, the nearest override on the way winning, and takes
 * the driver's parameter type for a domain over that base.
 */
export function mapType(ref: TypeRef, context: MappingContext): PositionTypes {
  const resolved = resolve(ref, context);
  if (resolved === undefined) {
    return UNKNOWN;
  }
  if ('select' in resolved) {
    return resolved;
  }
  const types = typesOf(resolved, context);
  if (resolved === ref) {
    return types;
  }
  const parameter = TABLES[context.driver].domainParameter(resolved, types);
  return { select: types.select, insert: parameter, update: parameter };
}
