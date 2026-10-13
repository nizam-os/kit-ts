/**
 * The declaration grammar (SPEC 3). These are the shapes a declaration may
 * take; `declareResource` narrows every name in them to the catalog and the
 * registries (`declaration-check.ts`), so the keys here are plain strings.
 * @packageDocumentation
 */
import type { PageCapabilitiesInit } from '@nizam-os/jsonapi-core';
import type { Operator, SortInput, TextSearchMode } from '@nizam-os/keyset-core';

/** The operations a resource serves (SPEC 3.3). */
export type Operation = 'list' | 'get' | 'create' | 'update' | 'remove';

/** How clients may use a member (SPEC 3.1). */
export type Access = 'read' | 'readWrite' | 'immutable' | 'write';

/** The operators a relationship accepts: its foreign-key column compared by id. */
export type RelationshipOperator = 'eq' | 'ne' | 'in' | 'nin' | 'isNull';

/** A column exposed as an attribute. */
export interface FieldDeclaration {
  readonly access: Access;
  /** The public name, in place of the derived one (SPEC 4.1). */
  readonly as?: string | undefined;
  /** A codec whose `types` include the column's type (SPEC 7.1). */
  readonly codec?: string | undefined;
  /** `@nizam-os/keyset-core` operators clients may filter with (SPEC 11.3). */
  readonly filter?: ReadonlyArray<Operator> | undefined;
  /** Whether clients may sort by the field; default false. */
  readonly sort?: boolean | undefined;
  readonly description?: string | undefined;
  /** A wire value the field's schema accepts, for the OpenAPI document. */
  readonly example?: unknown;
}

/** A single-column foreign key exposed as a to-one relationship. */
export interface RelationshipDeclaration {
  /**
   * Returns the declared resource of the referenced table. Typed `() => void`
   * so TypeScript infers a declaration without first inferring its targets,
   * which lets declarations reference each other (SPEC 3.8).
   * @ref https://github.com/microsoft/TypeScript/wiki/FAQ#why-are-functions-returning-non-void-assignable-to-function-returning-void
   */
  readonly target: () => void;
  readonly access: Exclude<Access, 'write'>;
  readonly as?: string | undefined;
  readonly filter?: ReadonlyArray<RelationshipOperator> | undefined;
  /** Whether clients may include the target; default false. */
  readonly include?: boolean | undefined;
  readonly description?: string | undefined;
}

/** Full-text search over a `tsvector` column (SPEC 3.7). */
export interface SearchDeclaration {
  readonly column: string;
  /** Required unless the column is generated with a configuration. */
  readonly config?: string | undefined;
  /** Default `websearch`. */
  readonly mode?: TextSearchMode | undefined;
}

/** The default sort, by field columns with an optional `-` prefix. */
export interface SortDeclaration {
  readonly default?: ReadonlyArray<SortInput> | undefined;
}

/** What a declaration adds to a constraint or a NOT NULL key (SPEC 3.5). */
export interface RuleDeclaration {
  /** The public error code, in place of the derived one (SPEC 4.1). */
  readonly code?: string | undefined;
  /** A validator for a CHECK whose rule is `null`. */
  readonly validator?: string | undefined;
}

/** A resource over one table, keyed by its database names. */
export interface Declaration {
  /** The public type, in place of the table's name (SPEC 4.1). */
  readonly as?: string | undefined;
  readonly operations: ReadonlyArray<Operation>;
  /** A scope of the definer; its column is written by the server. */
  readonly scope?: string | undefined;
  /** Accept client-generated ids on create; default false. */
  readonly clientIds?: boolean | undefined;
  readonly fields: Readonly<Record<string, FieldDeclaration>>;
  readonly relationships?:
    | Readonly<Record<string, RelationshipDeclaration>>
    | undefined;
  readonly search?: SearchDeclaration | undefined;
  readonly sort?: SortDeclaration | undefined;
  /** Overrides the definer's `page`, member by member. */
  readonly page?: PageCapabilitiesInit | undefined;
  readonly rules?: Readonly<Record<string, RuleDeclaration>> | undefined;
  readonly description?: string | undefined;
}

/**
 * A declaration's `relationships` or `rules` as declared, or `undefined`,
 * which has no keys, when the member is absent or `undefined`: the runtime
 * treats both alike. `NonNullable` would give `never`, whose keys are every
 * key, and a check over them would require an object there, which
 * TypeScript intersects with `undefined` and reduces the whole declaration
 * to `never` (`requirement.ts`).
 */
export type DeclaredMembers<
  TDecl extends Declaration,
  TMember extends 'relationships' | 'rules',
> =
  TDecl[TMember] extends NonNullable<Declaration[TMember]>
    ? TDecl[TMember]
    : undefined;

/** The member `TKey` of a declared object, or `undefined` when it has none. */
export type MemberOf<TValue, TKey extends string> = TValue extends {
  readonly [K in TKey]: infer TMember;
}
  ? TMember
  : undefined;
