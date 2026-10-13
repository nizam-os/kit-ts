/**
 * `errorCatalog(resources, appErrors?)` (SPEC 9.2): the codes of every
 * listed resource, resource-core's own `QUOTA_EXCEEDED`, and the
 * application's own codes, as one `@nizam-os/ban-core` catalog fragment to
 * spread into `createBan({ errors })` next to `ERROR_CATALOG` of
 * `@nizam-os/jsonapi-core`. The registry checks of SPEC 4.2 run first, so a
 * derived code never replaces another code without a `TypeError`. The
 * result's type keeps every key, so `ban.error('CONTACTS_EMAIL_UNIQUE')`
 * type-checks and a misspelled code does not.
 * @packageDocumentation
 */
import type { Catalog, EmptyCatalog } from '@nizam-os/ban-core';

import type { AnyDeclaredResource } from '../declare/declared-resource';
import type { RegistryCheck } from '../registry/registry-check';
import type { ErrorEntry } from './error-entry';
import type { QuotaExceededCatalog } from './quota-exceeded';

import { checkRegistry } from '../registry/check-registry';
import { QUOTA_EXCEEDED_CATALOG } from './quota-exceeded';

/** A resource's codes as catalog entries: each code's status and title. */
type ResourceCatalog<TResource> = TResource extends {
  readonly errors: infer TErrors extends Readonly<Record<string, ErrorEntry>>;
}
  ? {
      readonly [K in keyof TErrors]: {
        readonly status: TErrors[K]['status'];
        readonly title: TErrors[K]['title'];
      };
    }
  : never;

/** The intersection of a union's members. */
type Intersect<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TAll) => void
  ? TAll
  : never;

type Simplify<TValue> = { readonly [K in keyof TValue]: TValue[K] };

/** The catalog fragment `errorCatalog` returns for `TResources` and `TApp`. */
export type ErrorCatalog<
  TResources extends ReadonlyArray<AnyDeclaredResource>,
  TApp extends Catalog = EmptyCatalog,
> = Simplify<
  Intersect<ResourceCatalog<TResources[number]>> & QuotaExceededCatalog & TApp
>;

/**
 * The catalog fragment of `resources`' derived codes, `QUOTA_EXCEEDED`,
 * and `appErrors`, in that order, frozen. Throws `TypeError` listing every
 * registry conflict (SPEC 4.2): repeated types, a code derived from two
 * constraints or taken by `@nizam-os/ban-core`, `@nizam-os/jsonapi-core`,
 * resource-core, or the application, and a relationship whose target is
 * not listed.
 */
export function errorCatalog<
  const TResources extends ReadonlyArray<AnyDeclaredResource>,
  const TApp extends Catalog = EmptyCatalog,
>(
  resources: TResources & RegistryCheck<TResources>,
  appErrors?: TApp,
): ErrorCatalog<TResources, TApp> {
  const registry = checkRegistry('errorCatalog', resources, appErrors);
  const derived = registry.resources.flatMap((resource) =>
    Object.entries(resource.errors).map(
      ([code, { status, title }]) =>
        [code, Object.freeze({ status, title })] as const,
    ),
  );
  const catalog = Object.freeze({
    ...Object.fromEntries(derived),
    ...QUOTA_EXCEEDED_CATALOG,
    ...registry.appErrors,
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the entries are built above from each resource's errors, whose type ErrorCatalog maps key by key; error-catalog.test-d.ts proves the shape
  return catalog as unknown as ErrorCatalog<TResources, TApp>;
}
