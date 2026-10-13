/**
 * Policies (SPEC 12.2): one predicate per operation and per includable
 * relationship, deciding whether the actor may run it. Everything is
 * denied by default: an operation without a predicate, a predicate that
 * returns anything but `true`, and every operation of `denyAll`, the
 * policy of a resource that defines none. A denial without a row (`list`,
 * `create`) is `FORBIDDEN`; a denial with a row (`get`, `update`, `remove`)
 * is `NOT_FOUND`, built as the runtime builds the error of a missing row,
 * so a client cannot probe for rows it may not see. A denied include is
 * `FORBIDDEN` at the `include` parameter.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4 (an origin server that wishes to hide a forbidden resource MAY respond with 404)
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @packageDocumentation
 */
import type { AnyDeclaredResource } from '../declare/declared-resource';
import type { Requirement } from '../declare/requirement';
import type { Operation } from '../declare/types';
import type { DomainContext, DomainShape } from './domain-types';
import type {
  CreateInputOf,
  IncludableOf,
  OperationOf,
  PublicRowOf,
  UpdateInputOf,
} from './resource-types';

import { BanError, BUILTIN_CATALOG } from '@nizam-os/ban-core';

import { OPERATIONS } from '../declare/check-options';
import { internalsOf } from '../declare/declared-resource';
import { isRecord, ownValue } from '../internal/object';

type Predicate<TContext> = (context: TContext) => boolean | Promise<boolean>;

/** What each operation's predicate receives. */
export interface PolicyContexts<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
> {
  readonly list: DomainContext<TDomain>;
  readonly get: DomainContext<TDomain> & {
    readonly row: PublicRowOf<TResource>;
  };
  readonly create: DomainContext<TDomain> & {
    readonly input: CreateInputOf<TResource>;
  };
  readonly update: DomainContext<TDomain> & {
    readonly row: PublicRowOf<TResource>;
    readonly input: UpdateInputOf<TResource>;
  };
  readonly remove: DomainContext<TDomain> & {
    readonly row: PublicRowOf<TResource>;
  };
}

/** `include`: a predicate per includable relationship, or nothing for a resource without one. */
type IncludeInit<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
> = [IncludableOf<TResource>] extends [never]
  ? {
      readonly include?: Requirement<'the resource has no includable relationship'>;
    }
  : {
      readonly include?: {
        readonly [K in IncludableOf<TResource>]?: Predicate<
          DomainContext<TDomain>
        >;
      };
    };

/** `definePolicy`'s predicates: one per declared operation, and one per includable relationship. */
export type PolicyInit<
  TDomain extends DomainShape,
  TResource extends AnyDeclaredResource,
> = {
  readonly [K in OperationOf<TResource>]?: Predicate<
    PolicyContexts<TDomain, TResource>[K]
  >;
} & IncludeInit<TDomain, TResource>;

/** A resource's policy, which the runtime asks before each operation and each include. */
export interface Policy<
  TDomain extends DomainShape = DomainShape,
  TResource extends AnyDeclaredResource = AnyDeclaredResource,
> {
  /** Resolves when the actor may run `operation`; rejects with `FORBIDDEN` or `NOT_FOUND` otherwise. */
  readonly authorize: <TOperation extends OperationOf<TResource>>(
    operation: TOperation,
    context: PolicyContexts<TDomain, TResource>[TOperation],
  ) => Promise<void>;
  /** Resolves when the actor may include `relationship`; rejects with `FORBIDDEN` at `include` otherwise. */
  readonly authorizeInclude: (
    relationship: string,
    context: DomainContext<TDomain>,
  ) => Promise<void>;
}

/** The operations whose denial hides the row. */
const ROW_OPERATIONS: ReadonlySet<string> = new Set<Operation>([
  'get',
  'update',
  'remove',
]);
const INCLUDE_DENIED = 'The relationship may not be included.';

/** Each policy and the resource it was defined for; `denyAll` fits every resource. */
const POLICIES = new WeakMap<object, AnyDeclaredResource | undefined>();

function denial(operation: string): BanError {
  return ROW_OPERATIONS.has(operation)
    ? new BanError({ ...BUILTIN_CATALOG.NOT_FOUND, code: 'NOT_FOUND' })
    : new BanError({ ...BUILTIN_CATALOG.FORBIDDEN, code: 'FORBIDDEN' });
}

function includeDenial(): BanError {
  return new BanError({
    ...BUILTIN_CATALOG.FORBIDDEN,
    code: 'FORBIDDEN',
    detail: INCLUDE_DENIED,
    errors: [{ detail: INCLUDE_DENIED, location: 'query', path: ['include'] }],
  });
}

/** A predicate as JavaScript may write it: only an answer of exactly `true` allows. */
function isPredicate(value: unknown): value is (context: unknown) => unknown {
  return typeof value === 'function';
}

/** Whether `predicates` holds a predicate for `key` that returns exactly `true`. */
async function allows(
  predicates: Readonly<Record<string, unknown>>,
  key: string,
  context: unknown,
): Promise<boolean> {
  const predicate = ownValue(predicates, key);
  return isPredicate(predicate) && (await predicate(context)) === true;
}

function policyOf(
  predicates: Readonly<Record<string, unknown>>,
  include: Readonly<Record<string, unknown>>,
): Policy {
  return Object.freeze({
    authorize: async (operation: string, context: unknown) => {
      if (!(await allows(predicates, operation, context))) {
        throw denial(operation);
      }
    },
    authorizeInclude: async (relationship: string, context: unknown) => {
      if (!(await allows(include, relationship, context))) {
        throw includeDenial();
      }
    },
  });
}

/** The policy that denies every operation and every include: the default of a resource without one. */
export const denyAll: Policy = policyOf({}, {});
POLICIES.set(denyAll, undefined);

/** What a policy's keys name, for the messages. */
interface PredicateKeys {
  readonly member: string;
  readonly noun: string;
  readonly known: ReadonlySet<string>;
}

function checkPredicates(
  type: string,
  value: unknown,
  keys: PredicateKeys,
): Readonly<Record<string, unknown>> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new TypeError(
      `definePolicy: ${type}: ${keys.member} must be an object`,
    );
  }
  for (const [key, predicate] of Object.entries(value)) {
    if (!keys.known.has(key)) {
      throw new TypeError(
        `definePolicy: ${type}: "${key}" is not ${keys.noun}`,
      );
    }
    if (!isPredicate(predicate)) {
      throw new TypeError(
        `definePolicy: ${type}: the predicate of ${key} must be a function`,
      );
    }
  }
  return value;
}

/** The includable relationships' public names. */
function includable(resource: AnyDeclaredResource): ReadonlySet<string> {
  const relationships = resource.declaration.relationships ?? {};
  return new Set(
    Object.entries(relationships).flatMap(([column, relationship]) =>
      relationship.include === true
        ? (resource.names.columns.get(column) ?? [])
        : [],
    ),
  );
}

/** `definePolicy` at runtime: checks what JavaScript passes and builds the policy. */
export function definePolicyIn(resource: unknown, init: unknown): Policy {
  const internals = internalsOf(resource);
  if (internals === undefined) {
    throw new TypeError(
      'definePolicy: the resource must be a resource declareResource returned',
    );
  }
  const declared = internals.resource;
  const { type } = declared.names;
  if (!isRecord(init)) {
    throw new TypeError(`definePolicy: ${type}: the policy must be an object`);
  }
  const { include, ...operations } = init;
  const policy = policyOf(
    checkPredicates(type, operations, {
      member: 'the policy',
      noun: 'a declared operation',
      known: new Set(
        OPERATIONS.filter((operation) =>
          declared.declaration.operations.includes(operation),
        ),
      ),
    }),
    checkPredicates(type, include, {
      member: 'include',
      noun: 'an includable relationship',
      known: includable(declared),
    }),
  );
  POLICIES.set(policy, declared);
  return policy;
}

/** Whether `policy` was defined for `resource`, or is `denyAll`. */
export function isPolicyFor(policy: unknown, resource: object): boolean {
  if (typeof policy !== 'object' || policy === null || !POLICIES.has(policy)) {
    return false;
  }
  const owner = POLICIES.get(policy);
  return owner === undefined || owner === resource;
}
