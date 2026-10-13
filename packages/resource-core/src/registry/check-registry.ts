/**
 * The registry checks (SPEC 4.2), run wherever a list of resources is
 * assembled: `errorCatalog` now, `defineMessages`, `openapi`, and the
 * server runtime later. The list's shape is checked first and throws at
 * the first mistake, as every startup check does (SPEC 14); then every
 * conflict is collected, so one `TypeError` names them all. A code two
 * resources derive from one constraint, a domain they share or a table
 * both are declared over, is one code; from two constraints, a conflict.
 * @packageDocumentation
 */
import type { Catalog, ErrorDefinition } from '@nizam-os/ban-core';

import type {
  DeclaredInternals,
  DeclaredResource,
} from '../declare/declared-resource';

import { BUILTIN_CATALOG, isErrorStatus } from '@nizam-os/ban-core';
import { ERROR_CODES } from '@nizam-os/jsonapi-core';

import { internalsOf } from '../declare/declared-resource';
import { QUOTA_EXCEEDED_CODE } from '../errors/quota-exceeded';
import { describe, isRecord } from '../internal/object';

/** A checked list of resources and the application's own codes. */
export interface Registry {
  readonly resources: ReadonlyArray<DeclaredResource>;
  /** What each listed resource was built from, in the list's order. */
  readonly internals: ReadonlyArray<DeclaredInternals>;
  readonly appErrors: Catalog;
}

const DEFINITION_TEXTS = ['title', 'code', 'type', 'description'] as const;

const JSONAPI_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

function checkResources(
  caller: string,
  value: unknown,
): ReadonlyArray<DeclaredInternals> {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `${caller}.resources: must be an array of declared resources`,
    );
  }
  return value.map((resource: unknown, index) => {
    const internals = internalsOf(resource);
    if (internals === undefined) {
      throw new TypeError(
        `${caller}.resources[${String(index)}]: must be a resource declareResource returned`,
      );
    }
    return internals;
  });
}

export function isErrorDefinition(value: unknown): value is ErrorDefinition {
  return (
    isRecord(value) &&
    isErrorStatus(value['status']) &&
    DEFINITION_TEXTS.every(
      (key) => value[key] === undefined || typeof value[key] === 'string',
    )
  );
}

function checkAppErrors(caller: string, value: unknown): Catalog {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new TypeError(
      `${caller}.appErrors: must be an object of error definitions, received ${describe(value)}`,
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([code, definition]) => {
      if (!isErrorDefinition(definition)) {
        throw new TypeError(
          `${caller}.appErrors.${code}: must be an error definition of @nizam-os/ban-core: a 4xx or 5xx status, and title, code, type, and description strings when given`,
        );
      }
      return [code, definition];
    }),
  );
}

/** `a`, `a and b`, `a, b, and c`. */
function listOf(items: ReadonlyArray<string>): string {
  return items.length < 3
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')}, and ${String(items.at(-1))}`;
}

/** Each type at most once: the same resource twice, or two resources of one type. */
function typeConflicts(
  listed: ReadonlyArray<DeclaredInternals>,
): ReadonlyArray<string> {
  const byType = new Map<string, DeclaredResource>();
  return listed.flatMap(({ resource }) => {
    const { type } = resource.names;
    const first = byType.get(type);
    if (first === undefined) {
      byType.set(type, resource);
      return [];
    }
    return [
      first === resource
        ? `${type} is listed twice`
        : `type ${type} is the type of two resources, over ${first.table} and ${resource.table}`,
    ];
  });
}

/** Each code with, per origin, the types that derive it from there. */
function derivedCodes(
  listed: ReadonlyArray<DeclaredInternals>,
): ReadonlyMap<string, ReadonlyMap<string, ReadonlyArray<string>>> {
  const codes = new Map<string, Map<string, ReadonlyArray<string>>>();
  for (const { resource, errorOrigins } of new Set(listed)) {
    for (const [code, origin] of errorOrigins) {
      const origins = codes.get(code) ?? new Map<string, Array<string>>();
      origins.set(origin, [
        ...(origins.get(origin) ?? []),
        resource.names.type,
      ]);
      codes.set(code, origins);
    }
  }
  return codes;
}

/** Whose code a derived code would replace, if anyone's. */
function ownerOf(code: string, appErrors: Catalog): string | undefined {
  if (Object.hasOwn(BUILTIN_CATALOG, code)) {
    return 'a built-in code of @nizam-os/ban-core';
  }
  if (JSONAPI_CODES.has(code)) {
    return 'a code of @nizam-os/jsonapi-core';
  }
  if (code === QUOTA_EXCEEDED_CODE) {
    return "resource-core's own code";
  }
  return Object.hasOwn(appErrors, code) ? 'an application code' : undefined;
}

function codeConflicts(
  listed: ReadonlyArray<DeclaredInternals>,
  appErrors: Catalog,
): ReadonlyArray<string> {
  const conflicts: Array<string> = [];
  for (const [code, origins] of derivedCodes(listed)) {
    const derivers = listOf(
      [...origins].map(
        ([origin, types]) => `by ${listOf(types)} from ${origin}`,
      ),
    );
    if (origins.size > 1) {
      conflicts.push(
        `code ${code} is derived ${derivers}, so all but one need a code`,
      );
    }
    const owner = ownerOf(code, appErrors);
    if (owner !== undefined) {
      conflicts.push(
        `code ${code}, derived ${derivers}, is ${owner}, so the constraint needs a code`,
      );
    }
  }
  return conflicts;
}

/** Every relationship's target is a declared resource of the referenced table, and listed. */
function targetConflicts(
  listed: ReadonlyArray<DeclaredInternals>,
): ReadonlyArray<string> {
  const resources = new Set(listed.map(({ resource }) => resource));
  return [...new Set(listed)].flatMap(({ resource, specs }) =>
    specs.relationships.flatMap((spec) => {
      let target: DeclaredResource;
      try {
        target = spec.target();
      } catch (error) {
        if (error instanceof TypeError) {
          return [error.message];
        }
        throw error;
      }
      return resources.has(target)
        ? []
        : [
            `relationship ${resource.names.type}.${spec.name} targets ${target.names.type}, which is not listed`,
          ];
    }),
  );
}

/**
 * The checked registry: `resources` every one a resource `declareResource`
 * returned, `appErrors` a `@nizam-os/ban-core` catalog fragment. Throws one
 * `TypeError`, prefixed by `caller`, listing every conflict of SPEC 4.2.
 */
export function checkRegistry(
  caller: string,
  resources: unknown,
  appErrors: unknown,
): Registry {
  const listed = checkResources(caller, resources);
  const app = checkAppErrors(caller, appErrors);
  const conflicts = [
    ...typeConflicts(listed),
    ...codeConflicts(listed, app),
    ...(Object.hasOwn(app, QUOTA_EXCEEDED_CODE)
      ? [`appErrors.${QUOTA_EXCEEDED_CODE} replaces resource-core's own code`]
      : []),
    ...targetConflicts(listed),
  ];
  if (conflicts.length > 0) {
    throw new TypeError(`${caller}: ${conflicts.join('; ')}`);
  }
  return {
    resources: listed.map(({ resource }) => resource),
    internals: listed,
    appErrors: app,
  };
}
