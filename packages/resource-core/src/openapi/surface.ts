/**
 * `surfaceOf(resources)` (SPEC 13.2): what clients depend on, as a
 * deterministic JSON value to commit next to the catalog, the snapshot of
 * ADR 0003 that `diffSurfaces` compares. It starts with its `format`. Per
 * type: the operations; per
 * field its access, wire form, format, fraction digits, nullability,
 * requiredness on create, limits, options, an array's elements, codec,
 * operators, and sortability, all read from the field metadata (SPEC 8);
 * per relationship its target, access, requiredness, nullability,
 * operators, and include; the derived codes with their statuses; the
 * search parameter; and the page bounds. The keys of every map, types,
 * fields, relationships, and codes, are sorted, and so is every list whose
 * order means nothing: operations, operators, patterns; an object of a
 * fixed shape keeps its members' order. An enum's options keep their
 * order, which is PostgreSQL's sort order.
 * @ref https://github.com/nizam-os/kit-ts/blob/main/docs/resource/adr/0003-public-names-are-derived.md (the derived surface is snapshotted)
 * @packageDocumentation
 */
import type { Operator } from '@nizam-os/keyset-core';

import type {
  AnyDeclaredResource,
  DeclaredInternals,
} from '../declare/declared-resource';
import type { Access, Operation } from '../declare/types';
import type { FieldLimits, FieldMeta, ItemMeta, WireType } from '../meta/types';

import { checkRegistry } from '../registry/check-registry';

/** What a value takes: an attribute's, or an array's elements'. */
export interface ValueSurface {
  readonly wire: WireType;
  readonly format: string | null;
  readonly fractionDigits: number | null;
  readonly limits: FieldLimits;
  readonly options: ReadonlyArray<string> | null;
}

export interface FieldSurface extends ValueSurface {
  readonly access: Access;
  readonly nullable: boolean;
  readonly required: boolean;
  readonly items: ValueSurface | null;
  readonly codec: string | null;
  readonly operators: ReadonlyArray<Operator>;
  readonly sortable: boolean;
}

export interface RelationshipSurface {
  readonly target: string;
  readonly access: Access;
  readonly nullable: boolean;
  readonly required: boolean;
  readonly operators: ReadonlyArray<Operator>;
  readonly include: boolean;
}

export interface PageSurface {
  readonly default: number;
  readonly max: number;
  readonly range: boolean;
}

export interface ResourceSurface {
  readonly operations: ReadonlyArray<Operation>;
  readonly fields: Readonly<Record<string, FieldSurface>>;
  readonly relationships: Readonly<Record<string, RelationshipSurface>>;
  /** Each derived code's status (SPEC 9.1). */
  readonly codes: Readonly<Record<string, number>>;
  /** The search parameter, `null` without search. */
  readonly search: string | null;
  readonly page: PageSurface | null;
}

/**
 * The format `surfaceOf` writes, raised when the surface changes shape, so
 * a snapshot of another format is refused instead of diffed member by
 * member (`parseSurface`).
 */
export const SURFACE_FORMAT = 1;

/** The format, then each type's surface by type. */
export interface Surface {
  readonly format: typeof SURFACE_FORMAT;
  readonly resources: Readonly<Record<string, ResourceSurface>>;
}

/** `entries` as an object whose keys are in code-unit order, as `JSON.stringify` then writes them. */
function sortedObject<TValue>(
  entries: ReadonlyArray<readonly [string, TValue]>,
): Readonly<Record<string, TValue>> {
  return Object.fromEntries(
    entries.toSorted(([left], [right]) => (left < right ? -1 : 1)),
  );
}

function sorted<TValue extends string>(
  values: ReadonlyArray<TValue>,
): ReadonlyArray<TValue> {
  return values.toSorted();
}

function valueSurface(meta: ValueSurface | ItemMeta): ValueSurface {
  return {
    wire: meta.wire,
    format: meta.format,
    fractionDigits: meta.fractionDigits,
    limits: { ...meta.limits, patterns: sorted(meta.limits.patterns) },
    options: meta.options,
  };
}

function fieldSurface(meta: FieldMeta): FieldSurface {
  return {
    ...valueSurface(meta),
    access: meta.access,
    nullable: meta.nullable,
    required: meta.required,
    items: meta.items === null ? null : valueSurface(meta.items),
    codec: meta.codec,
    operators: sorted(meta.filter),
    sortable: meta.sortable,
  };
}

/** A relationship's target type, which its metadata always names (SPEC 8). */
function targetOf(meta: FieldMeta): string {
  if (meta.target === null) {
    throw new TypeError(`surfaceOf: relationship ${meta.name} names no target`);
  }
  return meta.target;
}

function relationshipSurface(
  meta: FieldMeta,
  includes: ReadonlySet<string>,
): RelationshipSurface {
  return {
    target: targetOf(meta),
    access: meta.access,
    nullable: meta.nullable,
    required: meta.required,
    operators: sorted(meta.filter),
    include: includes.has(meta.name),
  };
}

function resourceSurface(internals: DeclaredInternals): ResourceSurface {
  const { declaration, fields, errors, resource } = internals.resource;
  const { search, page, include } = resource.query;
  const metas = Object.values(fields);
  const includes = new Set(include);
  return {
    operations: sorted(declaration.operations),
    fields: sortedObject(
      metas
        .filter((meta) => meta.kind === 'attribute')
        .map((meta) => [meta.name, fieldSurface(meta)] as const),
    ),
    relationships: sortedObject(
      metas
        .filter((meta) => meta.kind === 'relationship')
        .map(
          (meta) => [meta.name, relationshipSurface(meta, includes)] as const,
        ),
    ),
    codes: sortedObject(
      Object.entries(errors).map(
        ([code, entry]) => [code, entry.status] as const,
      ),
    ),
    search: search?.parameter ?? null,
    page:
      page === undefined
        ? null
        : { default: page.default, max: page.max, range: page.range },
  };
}

/** The surface of `resources`; throws `TypeError` for a registry the checks refuse (SPEC 4.2). */
export function surfaceOf(
  resources: ReadonlyArray<AnyDeclaredResource>,
): Surface {
  return {
    format: SURFACE_FORMAT,
    resources: sortedObject(
      checkRegistry('surfaceOf', resources, {}).internals.map(
        (internals) =>
          [internals.resource.names.type, resourceSurface(internals)] as const,
      ),
    ),
  };
}
