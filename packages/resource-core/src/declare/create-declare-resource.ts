/**
 * `createDeclareResource` (SPEC 2): binds `declareResource` to the public
 * catalog and the application's registries, once, in the module that
 * exports the configured definer. Nothing lives in module-level state, so
 * two applications in one process cannot collide.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type {
  AtomicCapabilitiesInit,
  PageCapabilitiesInit,
  ResourceLinksInit,
} from '@nizam-os/jsonapi-core';

import type { DeclareResource } from './declare-resource-type';
import type { DomainsCheck } from './domains-check';
import type {
  CodecRegistry,
  DeclareContext,
  DomainRules,
  EmptyRegistry,
  ScopeRegistry,
  ValidatorRegistry,
} from './registries';
import type { Requirement } from './requirement';

import { checkDefinerConfig } from './check-config';
import { declareResourceIn } from './declare-resource';

/**
 * A full catalog has `schemas`, which the public catalog drops; the
 * definer takes the public catalog only, since declarations reach browsers
 * (SPEC 2, ADR 0002). It comes first in the constraint of `TCatalog`: a
 * full catalog fails `PublicCatalog` too, since its unique constraints have
 * no `partial`, and TypeScript reports only the first member of an
 * intersection that a type fails, so this message is the one a caller reads.
 * @ref https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/checker/relater.go (`typeRelatedToEachType` returns at the first member that fails)
 */
interface NotFullCatalog {
  readonly schemas?: Requirement<'catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers'>;
}

/** What `createDeclareResource` takes. */
export interface DeclareResourceConfig<
  TCatalog extends PublicCatalog,
  TCodecs extends CodecRegistry,
  TValidators extends ValidatorRegistry,
  TScopes extends ScopeRegistry,
  TDomains extends DomainRules,
> {
  /** The generated public catalog (`toPublicCatalog`), `as const`. */
  readonly catalog: TCatalog;
  readonly codecs?: TCodecs | undefined;
  readonly validators?: TValidators | undefined;
  /** Scope names to the column holding the actor's tenant (SPEC 3.2). */
  readonly scopes?: TScopes | undefined;
  /** Validators for domain CHECKs without a rule, and codes for any domain CHECK (SPEC 3.6). */
  readonly domains?: TDomains | undefined;
  /** Merged under every declaration's links (`@nizam-os/jsonapi-core`). */
  readonly links?: ResourceLinksInit | undefined;
  /** Merged under every declaration's `page`, member by member. */
  readonly page?: PageCapabilitiesInit | undefined;
  /**
   * Every declaration's cap on one Atomic Operations request, 10
   * operations by default (`@nizam-os/jsonapi-core`); one endpoint serves
   * every resource of a runtime, so no declaration has its own.
   */
  readonly atomic?: AtomicCapabilitiesInit | undefined;
}

/**
 * Returns a `declareResource` whose argument types come from the catalog
 * and the registries. The configuration is checked here, at startup; a full
 * catalog is refused, since declarations reach browsers (ADR 0002).
 */
export function createDeclareResource<
  const TCatalog extends NotFullCatalog & PublicCatalog,
  const TCodecs extends CodecRegistry = EmptyRegistry,
  const TValidators extends ValidatorRegistry = EmptyRegistry,
  const TScopes extends ScopeRegistry = EmptyRegistry,
  const TDomains extends DomainRules = EmptyRegistry,
>(
  config: DeclareResourceConfig<
    TCatalog,
    TCodecs,
    TValidators,
    TScopes,
    TDomains
  > &
    DomainsCheck<TCatalog, TCodecs, TValidators, TDomains>,
): DeclareResource<
  DeclareContext<TCatalog, TCodecs, TValidators, TScopes, TDomains>
> {
  const context = checkDefinerConfig(config);
  const declareResource = (table: unknown, declaration: unknown) =>
    declareResourceIn(context, table, declaration);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: one runtime function serves every instantiation of the generic signature; the type tests (declare-resource.test-d.ts, create-declare-resource.test-d.ts) hold the static side
  return declareResource as DeclareResource<
    DeclareContext<TCatalog, TCodecs, TValidators, TScopes, TDomains>
  >;
}
