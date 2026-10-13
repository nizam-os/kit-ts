/**
 * What the runtime's tests share (resource SPEC 12, 18.3): the plans, the
 * actors, a contact as a create's or an update's input, and the runtime
 * over a database's connections, booted by `createResourceRuntime` as a
 * host boots it, with the full catalog `pg-catalog extract` wrote. Acme's
 * plan holds three contacts and no companies; Globex's holds ten and
 * companies.
 */
import type { Kysely } from 'kysely';

import type { Catalog } from '@nizam-os/catalog-core';
import type {
  ResourceInput,
  ResourceRuntime,
  RuntimeOptions,
} from '@nizam-os/kysely-resource';

import type {
  AppActor,
  AppDomain,
  Permission,
  Plan,
  Services,
} from './domain.ts';

import { BanError } from '@nizam-os/ban-core';
import {
  createKyselyStorage,
  createResourceRuntime,
} from '@nizam-os/kysely-resource';

import { catalog } from '../fixtures/contacts/catalog.ts';
import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';
import { DEFINE_KEYSET } from '../support/keyset-definer.ts';
import {
  APP_ERRORS,
  CallsBehavior,
  ContactsBehavior,
  OrganizationsBehavior,
  QUOTAS,
  SCOPES,
} from './domain.ts';
import { OUTBOX } from './seed.ts';

const PLANS: ReadonlyMap<number, Plan> = new Map([
  [1, { contacts: 3, companies: false }],
  [2, { contacts: 10, companies: true }],
]);

const services: Services = {
  plans: {
    of: async (organization) => {
      await Promise.resolve();
      const plan = PLANS.get(organization);
      if (plan === undefined) {
        throw new Error(`organization ${String(organization)} has no plan`);
      }
      return plan;
    },
  },
};

/** Each resource's behavior, keyed by its type. */
export const RESOURCES = {
  contacts: ContactsBehavior,
  calls: CallsBehavior,
  organizations: OrganizationsBehavior,
};

/** The application's runtime, typed by its behaviors. */
export type AppRuntime = ResourceRuntime<AppDomain, typeof RESOURCES>;

/** What may differ from the application's own composition. */
export interface Composition {
  /** In place of the catalog `pg-catalog extract` wrote for the migrations. */
  readonly catalog?: Catalog | undefined;
  readonly resources?: typeof RESOURCES | undefined;
}

function member(
  organization: number,
  permissions: ReadonlyArray<Permission>,
): AppActor {
  return {
    id: `member of ${String(organization)}`,
    organization,
    can: (permission) => permissions.includes(permission),
  };
}

/** Acme's members by role, and an editor at Globex. */
export const editor = member(1, ['contacts:read', 'contacts:write']);
export const viewer = member(1, ['contacts:read']);
export const stranger = member(1, []);
/** An editor who may also read organizations, so may include a contact's. */
export const manager = member(1, [
  'contacts:read',
  'contacts:write',
  'organizations:read',
]);
export const globex = member(2, ['contacts:read', 'contacts:write']);

/** A contact's attributes as `@nizam-os/jsonapi-core` parses a resource object. */
export function contact(attributes: Record<string, unknown>): ResourceInput {
  return { attributes, relationships: {} };
}

/** The application's composition over `db`, its storage included. */
export function runtimeOptions(
  db: Kysely<unknown>,
  composition: Composition = {},
): RuntimeOptions<AppDomain, typeof RESOURCES> {
  return {
    storage: createKyselyStorage({
      db,
      catalog: publicCatalog,
      defineKeyset: DEFINE_KEYSET,
      outbox: { table: OUTBOX },
    }),
    catalog: composition.catalog ?? catalog,
    resources: composition.resources ?? RESOURCES,
    unscoped: ['organizations'],
    scopes: SCOPES,
    quotas: QUOTAS,
    services,
    errors: APP_ERRORS,
  };
}

/** The runtime over `db`, booted as a host boots it. */
export async function openRuntime(
  db: Kysely<unknown>,
  composition: Composition = {},
): Promise<AppRuntime> {
  return createResourceRuntime(runtimeOptions(db, composition));
}

/** What a client sees of an error the runtime threw. */
export async function visibleError(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => {
      throw new Error('the operation succeeded');
    },
    (failure: unknown) => failure,
  );
  if (!(error instanceof BanError)) {
    throw error;
  }
  const { status, code, title, detail, errors } = error;
  return { status, code, title, detail, errors };
}
