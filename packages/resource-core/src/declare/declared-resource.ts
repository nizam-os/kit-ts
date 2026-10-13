/**
 * The declared resource (SPEC 3): what `declareResource` returns. Its
 * identity is a private brand, a `WeakMap` membership, so a lookalike
 * object is never taken for a declaration where a registry is assembled;
 * the map also keeps what the `testing` entry reads and the public object
 * does not show: the member specs and the catalog.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type { AnyResource } from '@nizam-os/jsonapi-core';
import type { DefaultedKeysetInit } from '@nizam-os/keyset-core';

import type { ErrorEntry } from '../errors/error-entry';
import type { ResourceErrors } from '../errors/error-types';
import type { KeysetInitOf } from '../jsonapi/keyset-definition-types';
import type { ResourceOf } from '../jsonapi/resource-definition-types';
import type { TypedFields } from '../meta/field-meta-types';
import type { FieldMeta } from '../meta/types';
import type { ResourceNames } from '../names/types';
import type {
  AttributeSchemas,
  AttributeValidators,
} from '../schema/attribute-schemas';
import type { ObjectSchemas } from '../schema/object-schemas';
import type { ResourceSpecs } from '../schema/resource-specs';
import type {
  TypedAttributeSchemas,
  TypedObjectSchemas,
  TypedValidators,
  TypedWrite,
  TypesOf,
} from '../schema/resource-types';
import type { WriteValidators } from '../schema/write-schemas';
import type { DeclareContext } from './registries';
import type { Declaration } from './types';

/** The schemas' types: wide for a resource whose table TypeScript does not know, typed by the catalog otherwise. */
type Typed<TTable extends string, TWide, TTyped> = string extends TTable
  ? TWide
  : TTyped;

type Types<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> = TypesOf<TContext, TTable, TDecl>;

/** A resource declared over one table of the public catalog. */
export interface DeclaredResource<
  TContext extends DeclareContext = DeclareContext,
  TTable extends string = string,
  TDecl extends Declaration = Declaration,
> {
  /** The catalog key of the table. */
  readonly table: TTable;
  /** The declaration as given, frozen. */
  readonly declaration: TDecl;
  /** The public names and both directions of each mapping (SPEC 4.3). */
  readonly names: ResourceNames;
  /** Each derived error code's status, title, constraint kind, and the members its items point at (SPEC 9.1). */
  readonly errors: Typed<
    TTable,
    Readonly<Record<string, ErrorEntry>>,
    ResourceErrors<TContext, TTable, TDecl>
  >;
  /**
   * The read, create, and update schemas of the attributes, and `id`, the
   * schema of a resource id (SPEC 3.4, 6.2), built on first read.
   */
  readonly schema: Typed<
    TTable,
    AttributeSchemas,
    TypedAttributeSchemas<
      Types<TContext, TTable, TDecl>['read'],
      Types<TContext, TTable, TDecl>['create'],
      Types<TContext, TTable, TDecl>['update']
    >
  >;
  /** `schema.create`, `schema.update`, and `schema.id` as Standard Schema validators (SPEC 6.5). */
  readonly validate: Typed<
    TTable,
    AttributeValidators,
    TypedValidators<
      Types<TContext, TTable, TDecl>['create'],
      Types<TContext, TTable, TDecl>['update']
    >
  >;
  /**
   * The read, create, and update schemas of the relationships (SPEC 6.2),
   * built on first read, which reads every target (SPEC 3.8).
   */
  readonly linkage: Typed<
    TTable,
    ObjectSchemas,
    TypedObjectSchemas<
      Types<TContext, TTable, TDecl>['linkage']['read'],
      Types<TContext, TTable, TDecl>['linkage']['create'],
      Types<TContext, TTable, TDecl>['linkage']['update']
    >
  >;
  /** A create or an update as `{ attributes, relationships }`, with the CHECKs spanning both (SPEC 6.2). */
  readonly write: Typed<
    TTable,
    WriteValidators,
    TypedWrite<Types<TContext, TTable, TDecl>>
  >;
  /**
   * Each public field's and relationship's metadata, keyed by public name
   * (SPEC 8), built on first read, which reads every target (SPEC 3.8).
   */
  readonly fields: Typed<
    TTable,
    Readonly<Record<string, FieldMeta>>,
    TypedFields<TContext, TTable, TDecl>
  >;
  /**
   * The `@nizam-os/keyset-core` definition of the list, everything but its
   * cursor, which the server's `createDefineKeyset({ cursor })` adds
   * (SPEC 11.2).
   */
  readonly keyset: Typed<TTable, DefaultedKeysetInit, KeysetInitOf<TDecl>>;
  /**
   * The `@nizam-os/jsonapi-core` definition (SPEC 11.1), built on first
   * read, which reads every target (SPEC 3.8).
   */
  readonly resource: Typed<
    TTable,
    AnyResource,
    ResourceOf<TContext, TTable, TDecl>
  >;
  /**
   * Type-only: the definer's catalog and registries, for type helpers such as
   * `Infer`. Always absent at runtime.
   */
  readonly '~context'?: TContext | undefined;
}

/**
 * The constraint of a type helper that takes any declared resource, such as
 * `Infer` and `ErrorCatalog`: the members every resource's type records,
 * which TypeScript compares one by one and never fails on. The wide
 * `DeclaredResource` is the wrong constraint for a type parameter. Its
 * members are conditional types of the definer context, so TypeScript
 * relates two contexts invariantly, fails in the wide-to-specific
 * direction, and falls back to comparing the members. A type argument's
 * constraint check reports errors from the start, and in that mode the
 * failed check is recomputed on every reference instead of read from the
 * cache: about 45 ms and 23 MB per reference on stern's declarations
 * (SPEC 15.5). A variable's initializer is checked without reporting first,
 * so annotating a value with `DeclaredResource` stays cheap.
 * @ref https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/checker/checker.go (`checkTypeArgumentConstraints` calls `checkTypeAssignableTo`)
 * @ref https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/checker/relater.go ("We are elaborating errors and the cached result is a failure")
 */
export interface AnyDeclaredResource {
  readonly table: string;
  readonly declaration: Declaration;
  readonly names: ResourceNames;
  readonly '~context'?: DeclareContext | undefined;
}

/** What a declared resource was built from, beyond its public members. */
export interface DeclaredInternals {
  /** The resource itself, so one lookup gives a registry both. */
  readonly resource: DeclaredResource;
  readonly specs: ResourceSpecs;
  readonly catalog: PublicCatalog;
  /** Each error code's origin, the constraint behind it, for the registry checks (SPEC 4.2). */
  readonly errorOrigins: ReadonlyMap<string, string>;
  /** Domain reference name to CHECK name to code, for `constraintError` (SPEC 9.5). */
  readonly domainChecks: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** The column of the declaration's scope, which the server writes (SPEC 3.2). */
  readonly scopeColumn: string | undefined;
}

const DECLARED = new WeakMap<object, DeclaredInternals>();

/** Brands a resource built by `declareResource`. */
export function brandDeclared<TResource extends DeclaredResource>(
  resource: TResource,
  internals: Omit<DeclaredInternals, 'resource'>,
): TResource {
  DECLARED.set(resource, { ...internals, resource });
  return resource;
}

/** Whether a value was returned by a `declareResource`. */
export function isDeclaredResource(value: unknown): value is DeclaredResource {
  return typeof value === 'object' && value !== null && DECLARED.has(value);
}

/** What a resource `declareResource` returned was built from; `undefined` for any other value. */
export function internalsOf(value: unknown): DeclaredInternals | undefined {
  return typeof value === 'object' && value !== null
    ? DECLARED.get(value)
    : undefined;
}
