/**
 * The contacts application's queries (resource SPEC 20.6), made once per
 * set of clients, as an application makes them beside its clients; a
 * screen with bulk actions also makes, over the same transport, the
 * mutation that sends a selection's Atomic Operations (SPEC 21.3).
 */
import type { RecordOf, Transport } from '@nizam-os/jsonapi-client';
import type {
  OperationsOptions,
  ResourceQueries,
} from '@nizam-os/tanstack-query-jsonapi';

import type { ContactClients, ContactDefinitions } from './recorded-clients.ts';

import {
  operationsMutation,
  resourceQueries,
} from '@nizam-os/tanstack-query-jsonapi';

import { contactClients } from './recorded-clients.ts';

type ContactsDefinition = ContactDefinitions['contacts'];

/** A contact as the client reads one. */
export type Contact = RecordOf<ContactDefinitions, ContactsDefinition>;

/** The contacts' reads and writes. */
export interface ContactQueries {
  readonly contacts: ResourceQueries<ContactDefinitions, ContactsDefinition>;
}

/** The contacts' reads and writes, and one Atomic Operations request. */
export interface ContactActionQueries extends ContactQueries {
  readonly operations: OperationsOptions;
}

/** The queries over `clients`. */
export function contactQueries(clients: ContactClients): ContactQueries {
  return { contacts: resourceQueries(clients.contacts) };
}

/** The queries over the clients of `transport`, and its operations requests. */
export function contactActionQueries(
  transport: Transport,
): ContactActionQueries {
  return {
    ...contactQueries(contactClients(transport)),
    operations: operationsMutation(transport),
  };
}
