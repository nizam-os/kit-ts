/**
 * The relationship calls `createClients` types (SPEC 15.4): linkage read by
 * cardinality; linkage written only to the relationships an update may
 * carry, to-many alone for add and remove, since the server answers any
 * other write with 403; and pages followed from records, never from
 * linkage. The definitions are local for the reason `client.test-d.ts`
 * gives.
 */
import type { AnyResource, TypesOf } from '@nizam-os/jsonapi-core';

import type { IdentifierObject, ReadResult } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineResource } from '@nizam-os/jsonapi-core';

import { createTransport } from '../transport/transport';
import { createClients } from './create-clients';

const defineResource = createDefineResource({ links: { base: '/api' } });

const Tags = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
});

/** Without writable lists, so an update may carry every relationship. */
const People = defineResource({
  type: 'people',
  attributes: ['name'],
  relationships: {
    notes: {
      type: 'notes',
      cardinality: 'many',
      resource: (): AnyResource => Notes,
    },
  },
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
});

/** `owner` and `labels` updatable; `creator` and `watchers` set on create alone. */
const Notes = defineResource({
  type: 'notes',
  attributes: ['text'],
  relationships: {
    owner: { type: 'people', cardinality: 'one' },
    creator: { type: 'people', cardinality: 'one' },
    labels: { type: 'tags', cardinality: 'many' },
    watchers: { type: 'people', cardinality: 'many' },
  },
  serialize: (row: { readonly id: string; readonly text: string }) => ({
    id: row.id,
    attributes: { text: row.text },
  }),
  writable: { update: ['text', 'owner', 'labels'] },
});

/** A definition that serves no update, as `@nizam-os/resource-core` types a declaration without the operation. */
declare const Archives: Omit<typeof Notes, 'type' | '~types'> & {
  readonly type: 'archives';
  readonly '~types'?: Omit<TypesOf<typeof Notes>, 'update'> & {
    readonly update: never;
  };
};

const { archives, notes, people } = createClients(
  { archives: Archives, notes: Notes, people: People, tags: Tags },
  createTransport({ origin: 'https://api.example.test' }),
);

describe('relationship calls (SPEC 15.4)', () => {
  it('reads linkage by cardinality, each identifier with its meta', () => {
    expectTypeOf(notes.relationship('n1', 'owner')).toEqualTypeOf<
      Promise<ReadResult<IdentifierObject<'people'> | null>>
    >();
    expectTypeOf(notes.relationship('n1', 'labels')).toEqualTypeOf<
      Promise<ReadResult<ReadonlyArray<IdentifierObject<'tags'>>>>
    >();
  });

  it('writes linkage by cardinality, to-many alone for add and remove', () => {
    void notes.setRelationship('n1', 'owner', null);
    void notes.setRelationship('n1', 'owner', { type: 'people', id: 'p1' });
    void notes.setRelationship('n1', 'labels', ['t1']);
    void notes.addToRelationship('n1', 'labels', ['t1']);
    void notes.removeFromRelationship('n1', 'labels', [
      { type: 'tags', id: 't1' },
    ]);
    // @ts-expect-error -- a to-many takes a list
    void notes.setRelationship('n1', 'labels', 't1');
    // @ts-expect-error -- owner is a to-one
    void notes.addToRelationship('n1', 'owner', ['p1']);
    // @ts-expect-error -- people declare no editor
    void people.relationship('p1', 'editor');
  });

  it('writes only the relationships an update may carry, as the server answers 403 otherwise', () => {
    // @ts-expect-error -- creator is set on create alone
    void notes.setRelationship('n1', 'creator', 'p1');
    // @ts-expect-error -- watchers are set on create alone
    void notes.addToRelationship('n1', 'watchers', ['p1']);
    // @ts-expect-error -- watchers are set on create alone
    void notes.removeFromRelationship('n1', 'watchers', ['p1']);
    void people.setRelationship('p1', 'notes', ['n1']);
    void people.addToRelationship('p1', 'notes', ['n1']);
  });

  it('writes no relationship of a definition that serves no update, and reads each', () => {
    // @ts-expect-error -- archives serve no update
    void archives.setRelationship('x1', 'owner', null);
    // @ts-expect-error -- archives serve no update
    void archives.addToRelationship('x1', 'labels', ['t1']);
    expectTypeOf(archives.relationship('x1', 'creator')).toEqualTypeOf<
      Promise<ReadResult<IdentifierObject<'people'> | null>>
    >();
  });

  it('follows the pages of records, not linkage', async () => {
    const page = await notes.list();
    const linkage = await notes.relationship('n1', 'labels');

    expectTypeOf(notes.next(page)).toEqualTypeOf<
      Promise<typeof page | undefined>
    >();
    // @ts-expect-error -- next and prev page records
    void notes.next(linkage);
  });
});
