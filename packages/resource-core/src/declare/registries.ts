/**
 * The definer's registries and the context every declaration is checked
 * against (SPEC 2). `defineCodec` and `defineValidator` (SPEC 7) make the
 * values of the first two; a declaration reads each codec's `types` and
 * each validator's name.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { Codec, Validator } from '../codecs/types';

/** What a declaration reads of a codec: the type names it attaches to (SPEC 7.1). */
export interface CodecTypes {
  readonly types: ReadonlyArray<string>;
}

/** Codecs by name, each made by `defineCodec`. */
export type CodecRegistry = Readonly<Record<string, Codec>>;

/** Validators by name, each made by `defineValidator`. */
export type ValidatorRegistry = Readonly<Record<string, Validator>>;

/** A scope: the column that holds the actor's tenant in every scoped table (SPEC 3.2). */
export interface ScopeColumn {
  readonly column: string;
}

/** Scopes by name. */
export type ScopeRegistry = Readonly<Record<string, ScopeColumn>>;

/**
 * The definer's entry for one domain CHECK (SPEC 3.6): the validator that
 * covers a CHECK without a rule, or, for a CHECK whose rule enforces it
 * already, only its code.
 */
export interface DomainRule {
  /** The validator a CHECK without a rule needs; a CHECK with a rule takes none. */
  readonly validator?: string | undefined;
  /** The CHECK's error code, in place of the constraint name upper-cased (SPEC 6.4). */
  readonly code?: string | undefined;
}

/** Entries for domain CHECKs, by domain reference name and constraint name. */
export type DomainRules = Readonly<
  Record<string, Readonly<Record<string, DomainRule>>>
>;

/** An empty registry: the default when a definer has none. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: a registry the definer leaves out must have no names at all, so naming a codec, validator, scope, or domain rule fails to type-check; a `Record<string, never>` would admit every string
export type EmptyRegistry = Readonly<Record<never, never>>;

/** Everything a declaration is checked against: the catalog and the registries. */
export interface DeclareContext<
  TCatalog extends PublicCatalog = PublicCatalog,
  TCodecs extends CodecRegistry = CodecRegistry,
  TValidators extends ValidatorRegistry = ValidatorRegistry,
  TScopes extends ScopeRegistry = ScopeRegistry,
  TDomains extends DomainRules = DomainRules,
> {
  readonly catalog: TCatalog;
  readonly codecs: TCodecs;
  readonly validators: TValidators;
  readonly scopes: TScopes;
  readonly domains: TDomains;
}
