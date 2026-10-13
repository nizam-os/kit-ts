/**
 * The static problems of the composition (SPEC 18.3): what `resources`,
 * `scopes`, `unscoped`, and `quotas` hold against what each declaration
 * and the catalog say. Each message starts with the resource's type.
 * @packageDocumentation
 */
import type { ResourceBehavior } from '@nizam-os/resource-core/server';

import type { BootContext } from './options';

import { scopeColumnOf } from '@nizam-os/resource-core/server';

import { ownValue } from '../internal/object';

/** The scope problems of a scoped resource, and the `unscoped` problem of one without a scope. */
function scopeProblems(
  boot: BootContext,
  behavior: ResourceBehavior,
): ReadonlyArray<string> {
  const { resource } = behavior;
  const { type } = resource.names;
  const scope = resource.declaration.scope;
  if (scope === undefined) {
    return boot.unscoped.includes(type)
      ? []
      : [
          `${type}: the resource has no scope; list it in unscoped to run it without one`,
        ];
  }
  const binding = ownValue(boot.scopes, scope);
  if (binding === undefined) {
    return [`${type}: scope ${scope} has no binding in scopes`];
  }
  const declared = scopeColumnOf(resource);
  return binding.column === declared
    ? []
    : [
        `${type}: the binding of scope ${scope} names column ${binding.column}, but the declaration scopes ${resource.table} by ${String(declared)}`,
      ];
}

/** An includable relationship whose target type has no behavior. */
function includeProblems(
  boot: BootContext,
  behavior: ResourceBehavior,
): ReadonlyArray<string> {
  const { resource } = behavior;
  const types = new Set(
    boot.resources.map(([, other]) => other.resource.names.type),
  );
  return Object.entries(resource.declaration.relationships ?? {})
    .filter(([, relationship]) => relationship.include === true)
    .flatMap(([column]) => {
      const name = resource.names.columns.get(column) ?? column;
      const target = ownValue(resource.fields, name)?.target;
      return typeof target === 'string' && types.has(target)
        ? []
        : [
            `${resource.names.type}: relationship ${name} is includable, but resources has no behavior for its target ${String(target)}`,
          ];
    });
}

/** The problems of one behavior held under `key`. */
function behaviorProblems(
  boot: BootContext,
  key: string,
  behavior: ResourceBehavior,
): ReadonlyArray<string> {
  const { resource } = behavior;
  const { type } = resource.names;
  const problems: Array<string> = [];
  if (key !== type) {
    problems.push(
      `${type}: its behavior is under resources.${key}; key it by its type`,
    );
  }
  if (!Object.hasOwn(boot.catalog.tables, resource.table)) {
    problems.push(`${type}: the catalog has no table ${resource.table}`);
  }
  problems.push(
    ...scopeProblems(boot, behavior),
    ...includeProblems(boot, behavior),
  );
  const quota = behavior.operations.create?.quota;
  if (quota !== undefined && !Object.hasOwn(boot.quotas, quota)) {
    problems.push(`${type}: the create quota ${quota} is not in quotas`);
  }
  return problems;
}

/** Every binding problem of the composition, in the order of `resources`, then of `unscoped`. */
export function bindingProblems(boot: BootContext): ReadonlyArray<string> {
  const unscopedTypes = new Set(
    boot.resources
      .filter(
        ([, behavior]) => behavior.resource.declaration.scope === undefined,
      )
      .map(([, behavior]) => behavior.resource.names.type),
  );
  return [
    ...boot.resources.flatMap(([key, behavior]) =>
      behaviorProblems(boot, key, behavior),
    ),
    ...boot.unscoped
      .filter((type) => !unscopedTypes.has(type))
      .map(
        (type) =>
          `${type}: unscoped lists it, but resources has no unscoped resource ${type}`,
      ),
  ];
}
