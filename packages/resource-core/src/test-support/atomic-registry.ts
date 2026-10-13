/**
 * A registry for the Atomic Operations tests (SPEC 13.1), over the
 * unit-test catalog and linked under `/api`: teams, with every write and
 * a nullable lead linking people; people, created and updated, each
 * linking its team; contacts, created and updated, linking an
 * organization; organizations, updated but never created, so no `add`
 * gives one a lid; and meetings, updated, reading their organization. `processes` runs a document through
 * `@nizam-os/jsonapi-core`'s processor over handlers of the same
 * resources, which keep nothing, with an `href` resolver of the links'
 * URL design, so a test holds the document's schema to what the processor
 * accepts. Not published with the package.
 * @ref https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md (section 11)
 * @packageDocumentation
 */
import type { AnyResourceHandlers } from '@nizam-os/jsonapi-core/atomic';

import type { DeclaredResource } from '../declare/declared-resource';

import { operationsProcessor } from '@nizam-os/jsonapi-core/atomic';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from './contacts';
import { TEST_REGISTRIES } from './definer';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
  links: { base: '/api' },
});

export const AtomicOrganizations: DeclaredResource = declareResource(
  'organizations',
  {
    operations: ['get', 'update'],
    fields: { name: { access: 'readWrite' } },
  },
);

export const Teams: DeclaredResource = declareResource('teams', {
  operations: ['get', 'create', 'update', 'remove'],
  fields: { name: { access: 'readWrite' }, slug: { access: 'readWrite' } },
  relationships: { lead_id: { target: () => People, access: 'readWrite' } },
});

export const People: DeclaredResource = declareResource('people', {
  operations: ['create', 'update'],
  fields: { name: { access: 'readWrite' } },
  relationships: { team_id: { target: () => Teams, access: 'readWrite' } },
});

/** Meetings, updated, whose organization is read only, so no update reaches it. */
const AtomicMeetings: DeclaredResource = declareResource('meetings', {
  operations: ['update'],
  fields: { notes: { access: 'readWrite' } },
  relationships: {
    organization_id: { target: () => AtomicOrganizations, access: 'read' },
  },
  rules: { meetings_contact_or_notes: { validator: 'contactOrNotes' } },
});

export const AtomicContacts: DeclaredResource = declareResource('contacts', {
  operations: ['create', 'update'],
  fields: {
    kind: { access: 'immutable' },
    name: { access: 'readWrite' },
    email: { access: 'readWrite' },
  },
  relationships: {
    organization_id: {
      target: () => AtomicOrganizations,
      access: 'readWrite',
    },
  },
});

/** The registry, in the order the document lists it. */
export const ATOMIC_RESOURCES: ReadonlyArray<DeclaredResource> = [
  Teams,
  People,
  AtomicContacts,
  AtomicOrganizations,
  AtomicMeetings,
];

const HREF =
  /^\/api\/(teams|people|contacts|organizations|meetings)(?:\/([^/]+)(?:\/relationships\/([a-z]+))?)?$/u;

/** What an `href` names by the links' URL design: a collection, a resource, or a relationship link. */
function resolveHref(
  href: string,
): { type: string; id?: string; relationship?: string } | undefined {
  const match = HREF.exec(href);
  const [, type, id, relationship] = match ?? [];
  if (type === undefined) {
    return undefined;
  }
  return {
    type,
    ...(id === undefined ? {} : { id }),
    ...(relationship === undefined ? {} : { relationship }),
  };
}

let created = 0;
/** A fresh UUID for each created row. */
function nextId(): string {
  created += 1;
  return `00000000-0000-4000-8000-${String(created).padStart(12, '0')}`;
}

/** A handler that keeps nothing and returns nothing. */
function kept(): undefined {
  return undefined;
}

function handlersOf(
  declared: DeclaredResource,
): AnyResourceHandlers<null, null> {
  const operations = new Set<string>(declared.declaration.operations);
  // As a host's: an update of each relationship the resource updates.
  const updated = Object.fromEntries(
    [...declared.resource.writable.update]
      .filter((name) => Object.hasOwn(declared.resource.relationships, name))
      .map((name) => [name, { update: kept }]),
  );
  return {
    resource: declared.resource,
    ...(operations.has('create')
      ? { create: ({ data }) => ({ id: data.id ?? nextId() }) }
      : {}),
    ...(operations.has('update')
      ? { update: ({ id }) => ({ id }), relationships: updated }
      : {}),
    ...(operations.has('remove') ? { remove: kept } : {}),
  };
}

const process = operationsProcessor<null, null>({
  resources: ATOMIC_RESOURCES.map((declared) => handlersOf(declared)),
  transaction: async (_ctx, run) => run(null),
  resolveHref,
});

/** The results document of `document`'s operations, `undefined` when none has a result; throws what the processor refuses. */
export async function resultsOf(document: unknown): Promise<unknown> {
  return (await process(document, null)).document;
}

/** Whether the processor runs every operation of `document`. */
export async function processes(document: unknown): Promise<boolean> {
  try {
    await process(document, null);
    return true;
  } catch {
    return false;
  }
}
