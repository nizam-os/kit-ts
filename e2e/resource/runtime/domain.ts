/**
 * The contacts application's server domain (resource SPEC 12): who acts,
 * what they may do, the plans the runtime hands over as services, the
 * application's own codes, the events, the contacts quota, the tenant
 * scope bound to the session, and the behavior of each resource. A plan
 * may leave out company contacts, which a rule refuses with 402; an
 * archived contact keeps its name; every write of a contact records an
 * event. Calls are stored in partitions. Organizations, the tenants, run
 * without a scope: a member who may read them reads every one, and only
 * the application's own provisioning, outside the runtime, writes them.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.3 (402 Payment Required)
 */
import type {
  Actor,
  QuotaContext,
  ScopeBindings,
} from '@nizam-os/resource-core/server';

import type { scopes } from '../resources/declare-resource.ts';

import { z } from 'zod';

import {
  createDomainDefiners,
  defineEvent,
  defineQuota,
  defineScope,
} from '@nizam-os/resource-core/server';

import { Calls } from '../resources/calls.ts';
import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';

export type Permission =
  | 'contacts:read'
  | 'contacts:write'
  | 'organizations:read';

/** A member of one organization. */
export interface AppActor extends Actor<Permission> {
  readonly organization: number;
}

/** What an organization's plan allows. */
export interface Plan {
  readonly contacts: number;
  readonly companies: boolean;
}

/** What the runtime hands to policies, rules, effects, and quotas. */
export interface Services {
  readonly plans: { readonly of: (organization: number) => Promise<Plan> };
}

/** The application's own codes, next to the ones resource-core derives. */
export const APP_ERRORS = {
  PLAN_UPGRADE_REQUIRED: { status: 402, title: 'Plan Upgrade Required' },
  CONTACT_ARCHIVED: { status: 409, title: 'Contact Archived' },
} as const;

/** Each binding of the definer's scopes: the actor's organization, as the row security policy reads it. */
export const SCOPES = {
  organization: defineScope({
    column: 'organization_id',
    value: (actor: AppActor) => actor.organization,
    session: 'app.organization_id',
  }),
} satisfies ScopeBindings<typeof scopes, AppActor>;

export const QUOTAS = {
  contacts: defineQuota({
    limit: async ({ actor, services }: QuotaContext<AppActor, Services>) =>
      (await services.plans.of(actor.organization)).contacts,
  }),
};

export interface AppDomain {
  readonly actor: AppActor;
  readonly permissions: Permission;
  readonly quotas: keyof typeof QUOTAS;
  readonly services: Services;
  readonly errors: typeof APP_ERRORS;
}

const ContactCreated = defineEvent(
  'contact.created',
  1,
  z.object({ id: z.uuid(), name: z.string() }),
);
const ContactRenamed = defineEvent(
  'contact.renamed',
  1,
  z.object({ id: z.uuid(), from: z.string(), to: z.string() }),
);
const ContactRemoved = defineEvent(
  'contact.removed',
  1,
  z.object({ id: z.uuid() }),
);

const { definePolicy, defineResource } = createDomainDefiners<AppDomain>();

export const contactsPolicy = definePolicy(Contacts, {
  list: ({ actor }) => actor.can('contacts:read'),
  get: ({ actor }) => actor.can('contacts:read'),
  create: ({ actor }) => actor.can('contacts:write'),
  update: ({ actor }) => actor.can('contacts:write'),
  remove: ({ actor }) => actor.can('contacts:write'),
  include: { organization: ({ actor }) => actor.can('organizations:read') },
});

export const ContactsBehavior = defineResource(Contacts, {
  policy: contactsPolicy,
  operations: {
    create: {
      quota: 'contacts',
      rules: [
        async ({ actor, services, input, reject }) => {
          const plan = await services.plans.of(actor.organization);
          if (input.attributes.kind === 'company' && !plan.companies) {
            reject('PLAN_UPGRADE_REQUIRED', {
              fields: ['kind'],
              detail: 'Company contacts need a plan that includes them.',
            });
          }
        },
      ],
      effects: [
        ({ row }) => [ContactCreated.of({ id: row.id, name: row.name })],
      ],
    },
    update: {
      rules: [
        ({ row, input, reject }) => {
          if (
            row.status === 'archived' &&
            input.attributes.name !== undefined
          ) {
            reject('CONTACT_ARCHIVED', {
              fields: ['name'],
              detail: 'An archived contact keeps its name.',
            });
          }
        },
      ],
      effects: [
        ({ row, previous }) =>
          row.name === previous.name
            ? []
            : [
                ContactRenamed.of({
                  id: row.id,
                  from: previous.name,
                  to: row.name,
                }),
              ],
      ],
    },
    remove: {
      effects: [({ row }) => [ContactRemoved.of({ id: row.id })]],
    },
  },
});

export const CallsBehavior = defineResource(Calls, {
  policy: definePolicy(Calls, {
    get: ({ actor }) => actor.can('contacts:read'),
    create: ({ actor }) => actor.can('contacts:write'),
  }),
});

export const OrganizationsBehavior = defineResource(Organizations, {
  policy: definePolicy(Organizations, {
    list: ({ actor }) => actor.can('organizations:read'),
    get: ({ actor }) => actor.can('organizations:read'),
    create: () => false,
    update: () => false,
  }),
});
