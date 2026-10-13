/**
 * Meetings, served next to the application's resources (resource SPEC 12,
 * 20.5): a member who may write contacts books a room, and the storage
 * holds the text form of the `timeRange` codec `meetings.during` carries.
 * `meetings_no_double_booking` refuses a booking of a room for a period
 * that overlaps another, which a person answers by changing the room or
 * the period, so a form shows the refusal on both.
 */
import type { Kysely } from 'kysely';

import type { ResourceRuntime } from '@nizam-os/kysely-resource';

import type { AppDomain } from './domain.ts';

import {
  createKyselyStorage,
  createResourceRuntime,
} from '@nizam-os/kysely-resource';
import { createDomainDefiners } from '@nizam-os/resource-core/server';

import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';
import { Meetings } from '../resources/meetings.ts';
import { DEFINE_KEYSET } from '../support/keyset-definer.ts';
import { timeRangeText } from '../support/time-range-text.ts';
import { RESOURCES, runtimeOptions } from './fixture.ts';
import { OUTBOX } from './seed.ts';

const { definePolicy, defineResource } = createDomainDefiners<AppDomain>();

const MeetingsBehavior = defineResource(Meetings, {
  policy: definePolicy(Meetings, {
    list: ({ actor }) => actor.can('contacts:read'),
    get: ({ actor }) => actor.can('contacts:read'),
    create: ({ actor }) => actor.can('contacts:write'),
    update: ({ actor }) => actor.can('contacts:write'),
    remove: ({ actor }) => actor.can('contacts:write'),
    include: { contact: ({ actor }) => actor.can('contacts:read') },
  }),
});

/** The runtime over `db` with meetings among its resources. */
export async function openMeetingsRuntime(
  db: Kysely<unknown>,
): Promise<ResourceRuntime<AppDomain>> {
  return createResourceRuntime({
    ...runtimeOptions(db),
    storage: createKyselyStorage({
      db,
      catalog: publicCatalog,
      defineKeyset: DEFINE_KEYSET,
      outbox: { table: OUTBOX },
      codecs: { timeRange: timeRangeText },
    }),
    resources: { ...RESOURCES, meetings: MeetingsBehavior },
  });
}
