/**
 * Runtime-neutral checks of the `server` and `testing` entries (resource
 * SPEC 12, 16) over the built package: a PostgreSQL refusal, shaped as
 * node-postgres raises it, becomes its declared error; a policy denies
 * what it does not allow; scopes, quotas, events, and rejections behave as
 * documented; and the storage contract's fixture declares and lists its
 * cases. No Node.js API, so the module runs on Bun, Deno, and workerd.
 */
import type { StorageAdapter } from '@nizam-os/resource-core/server';

import type { Checks } from './report.ts';

import { z } from 'zod';

import { BanError } from '@nizam-os/ban-core';
import { errorCatalog } from '@nizam-os/resource-core';
import {
  constraintError,
  createDomainDefiners,
  defineEvent,
  defineScope,
  quotaExceeded,
  reject,
  Rejection,
  rejectionError,
  scopeValues,
} from '@nizam-os/resource-core/server';
import {
  contractFixture,
  storageContract,
} from '@nizam-os/resource-core/testing';

import { Contacts } from '../resources/contacts.ts';
import { Meetings } from '../resources/meetings.ts';
import { Notes } from '../resources/notes.ts';
import { Organizations } from '../resources/organizations.ts';
import { check } from './report.ts';

const RESOURCES = [Organizations, Contacts, Meetings, Notes] as const;

async function unused(): Promise<never> {
  await Promise.resolve();
  throw new Error('the smoke checks run no contract case');
}

/** An adapter the cases are listed over but never run against. */
const UNUSED_ADAPTER: StorageAdapter<never> = {
  transaction: unused,
  list: unused,
  get: unused,
  lock: unused,
  create: unused,
  update: unused,
  remove: unused,
  count: unused,
  record: unused,
  partitionRoot: unused,
};

/** What `authorized` rejected with; `allowed` when it resolved. */
async function denialOf(authorized: Promise<void>): Promise<unknown> {
  try {
    await authorized;
  } catch (error) {
    return error;
  }
  return 'allowed';
}

/** What `reject` threw. */
function rejectionOf(run: () => void): Rejection {
  try {
    run();
  } catch (error) {
    if (error instanceof Rejection) {
      return error;
    }
    throw error;
  }
  throw new Error('no Rejection');
}

export const serverChecks: Checks = {
  'maps a PostgreSQL refusal to its declared error': () => {
    const refusal = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      {
        severity: 'ERROR',
        code: '23505',
        schema: 'public',
        table: 'contacts',
        constraint: 'contacts_email_unique',
      },
    );
    const error = constraintError(refusal, {
      resource: Contacts,
      operation: 'create',
    });
    check(error instanceof BanError, 'not a BanError');
    check(error.code === 'CONTACT_EMAIL_TAKEN', error.code);
    check(error.status === 409, String(error.status));
    check(error.cause === refusal, 'the cause is not the driver error');
    const path = error.errors?.[0]?.path?.join('/');
    check(path === 'data/attributes/email', String(path));
  },
  'denies what its policy does not allow': async () => {
    const { definePolicy } = createDomainDefiners<{
      actor: {
        readonly id: string;
        readonly can: (permission: 'contacts:list') => boolean;
      };
      permissions: 'contacts:list';
      quotas: never;
      services: Record<string, never>;
      errors: {
        readonly SEAT_LIMIT: {
          readonly status: 402;
          readonly title: 'Seat Limit';
        };
      };
    }>();
    const policy = definePolicy(Contacts, {
      list: ({ actor }) => actor.can('contacts:list'),
    });
    const denied = await denialOf(
      policy.authorize('list', {
        actor: { id: 'a', can: () => false },
        services: {},
      }),
    );
    check(denied instanceof BanError, 'the denial is not a BanError');
    check(denied.code === 'FORBIDDEN', denied.code);
  },
  'binds scopes, checks quotas, and makes events': () => {
    const organization = defineScope({
      column: 'organization_id',
      value: (actor: { readonly organization: string }) => actor.organization,
      session: 'app.organization_id',
    });
    const [scope] = scopeValues({ organization }, { organization: '7' });
    check(scope?.session === 'app.organization_id', String(scope?.session));
    check(scope.value === '7', String(scope.value));
    check(quotaExceeded(2, 3) === undefined, 'a free slot refused');
    check(
      quotaExceeded(3, 3)?.code === 'QUOTA_EXCEEDED',
      'a full quota passed',
    );
    const created = defineEvent(
      'contact.created',
      1,
      z.object({ id: z.string() }),
    ).of({ id: '1' });
    check(Object.isFrozen(created), 'the event is not frozen');
    check(created.payload.id === '1', JSON.stringify(created));
  },
  'turns a rejection into its code': () => {
    const errors = errorCatalog(RESOURCES, {
      SEAT_LIMIT: { status: 402, title: 'Seat Limit' },
    });
    const rejection = rejectionOf(() =>
      reject('SEAT_LIMIT', { fields: ['email'], detail: 'No seat is left.' }),
    );
    const error = rejectionError(rejection, { resource: Contacts, errors });
    check(error.status === 402, String(error.status));
    check(error.detail === 'No seat is left.', String(error.detail));
    const path = error.errors?.[0]?.path?.join('/');
    check(path === 'data/attributes/email', String(path));
  },
  'ships the storage contract': () => {
    const { tasks, workspaces } = contractFixture.resources;
    check(tasks.names.type === 'tasks', tasks.names.type);
    check(workspaces.declaration.scope === undefined, 'workspaces scoped');
    const cases = storageContract({
      adapter: UNUSED_ADAPTER,
      reset: async () => {
        await Promise.resolve();
      },
      events: async () => {
        await Promise.resolve();
        return [];
      },
    });
    check(cases.length > 0, 'no cases');
    check(
      cases.every(({ name }) => name.startsWith('obligation ')),
      'a case not named after its obligation',
    );
  },
};
