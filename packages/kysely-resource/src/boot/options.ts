/**
 * The options boot reads (SPEC 18.3), checked before any check runs: each
 * JavaScript mistake throws `TypeError` naming the caller and the option,
 * as `createKyselyStorage` and `relayOutbox` do. What comes back is what
 * the checks read: the storage's own options, the full catalog, and each
 * resource's behavior by the key it is held under.
 * @packageDocumentation
 */
import type { Catalog } from '@nizam-os/catalog-core';
import type { ResourceBehavior, Scope } from '@nizam-os/resource-core/server';

import type { StorageConfig } from '../storage/options';

import { isResourceBehavior } from '@nizam-os/resource-core/server';

import { checkKeys } from '../internal/kysely-options';
import { isRecord } from '../internal/object';
import { storageConfigOf } from '../storage/registry';

/** What the checks read, the options checked. */
export interface BootContext {
  readonly config: StorageConfig;
  readonly catalog: Catalog;
  /** Each behavior with the key `resources` holds it under, in the options' order. */
  readonly resources: ReadonlyArray<readonly [string, ResourceBehavior]>;
  readonly scopes: Readonly<Record<string, Scope>>;
  readonly unscoped: ReadonlyArray<string>;
  readonly quotas: Readonly<Record<string, unknown>>;
}

const OPTIONS: ReadonlySet<string> = new Set([
  'storage',
  'catalog',
  'resources',
  'scopes',
  'unscoped',
  'quotas',
  'services',
  'errors',
  'afterCommit',
  'report',
]);

function isFullCatalog(value: unknown): value is Catalog {
  return (
    isRecord(value) &&
    Array.isArray(value['schemas']) &&
    isRecord(value['tables'])
  );
}

function isBinding(value: unknown): value is Scope {
  return (
    isRecord(value) &&
    typeof value['column'] === 'string' &&
    typeof value['session'] === 'string' &&
    typeof value['value'] === 'function'
  );
}

/** `value` as a record of `T`, each member checked by `is`; throws naming the first member that fails. */
function records<TValue>(
  caller: string,
  option: string,
  value: unknown,
  is: (member: unknown) => member is TValue,
  expected: { readonly whole: string; readonly member: string },
): Readonly<Record<string, TValue>> {
  if (!isRecord(value)) {
    throw new TypeError(
      `${caller}: options.${option} must be ${expected.whole}`,
    );
  }
  for (const [key, member] of Object.entries(value)) {
    if (!is(member)) {
      throw new TypeError(
        `${caller}: ${option}.${key} must be ${expected.member}`,
      );
    }
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: every member passed `is` just above
  return value as Readonly<Record<string, TValue>>;
}

function isQuota(value: unknown): value is object {
  return isRecord(value) && typeof value['limit'] === 'function';
}

function unscopedTypes(caller: string, value: unknown): ReadonlyArray<string> {
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    !value.every((type): type is string => typeof type === 'string')
  ) {
    throw new TypeError(
      `${caller}: options.unscoped must be a list of resource types`,
    );
  }
  return value;
}

function checkHook(caller: string, option: string, value: unknown): void {
  if (value !== undefined && typeof value !== 'function') {
    throw new TypeError(`${caller}: options.${option} must be a function`);
  }
}

/** The options as the checks read them; throws `TypeError` for the first option boot cannot use. */
export function bootContext(caller: string, options: unknown): BootContext {
  if (!isRecord(options)) {
    throw new TypeError(`${caller}: options must be an object`);
  }
  checkKeys(caller, 'options', options, OPTIONS);
  const config = storageConfigOf(options['storage']);
  if (config === undefined) {
    throw new TypeError(
      `${caller}: options.storage must come from createKyselyStorage`,
    );
  }
  const { catalog } = options;
  if (!isFullCatalog(catalog)) {
    throw new TypeError(
      `${caller}: options.catalog must be the full catalog pg-catalog extract writes`,
    );
  }
  const resources = records(
    caller,
    'resources',
    options['resources'],
    isResourceBehavior,
    {
      whole: 'an object of behaviors keyed by type',
      member:
        'a behavior defineResource returned (a second installed copy of @nizam-os/resource-core also fails this)',
    },
  );
  const scopes = records(caller, 'scopes', options['scopes'], isBinding, {
    whole: 'an object of bindings keyed by scope',
    member: 'a binding defineScope returned',
  });
  const unscoped = unscopedTypes(caller, options['unscoped']);
  const quotas = records(caller, 'quotas', options['quotas'], isQuota, {
    whole: 'an object of quotas keyed by name',
    member: 'a quota defineQuota returned',
  });
  if (!isRecord(options['errors'])) {
    throw new TypeError(
      `${caller}: options.errors must be an object of the application's codes`,
    );
  }
  checkHook(caller, 'afterCommit', options['afterCommit']);
  checkHook(caller, 'report', options['report']);
  return {
    config,
    catalog,
    resources: Object.entries(resources),
    scopes,
    unscoped,
    quotas,
  };
}
