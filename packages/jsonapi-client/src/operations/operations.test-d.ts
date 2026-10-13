/**
 * The operations' types (SPEC 17.1, 17.2): each builder's input typed as
 * the call of its name types it, with a `lid` on a create and local
 * identifiers of the relationship's type among its values; each
 * operation typed by the data its result holds; and the results of a
 * tuple of operations a tuple, of a list type a list. The blog is defined
 * here, since what matters is what `defineResource` infers.
 */
import type {
  AnyResource,
  Links,
  Meta,
  Relationships,
} from '@nizam-os/jsonapi-core';

import type { Identifier } from '../document/types';
import type { Operation, OperationResult, OperationsResult } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineResource } from '@nizam-os/jsonapi-core';

import { createTransport } from '../transport/transport';
import { operationsOf } from './operations-of';
import { sendOperations } from './send-operations';

const defineResource = createDefineResource({ links: { base: '/api' } });

declare const createArticle: {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'test';
    readonly validate: (value: unknown) => { value: { title: string } };
    readonly types: {
      input: { readonly title: string; readonly body?: string | undefined };
      output: { title: string };
    };
  };
};

const Tags = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
});

const People = defineResource({
  type: 'people',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: {
    author: {
      type: 'people',
      cardinality: 'one',
      resource: (): AnyResource => People,
    },
    tags: {
      type: 'tags',
      cardinality: 'many',
      resource: (): AnyResource => Tags,
    },
  },
  serialize: (row: {
    readonly id: string;
    readonly title: string;
    readonly body: string;
  }) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
  }),
  validate: { create: createArticle },
  writable: {
    create: ['title', 'body', 'author', 'tags'],
    update: ['title', 'tags'],
  },
});

interface ArticleRecord {
  readonly type: 'articles';
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly author: Identifier<'people'> | null | undefined;
  readonly tags: ReadonlyArray<Identifier<'tags'>> | undefined;
  readonly $links?: Links;
  readonly $meta?: Meta;
  readonly $relationships?: Relationships;
}

const articles = operationsOf(Articles);
const transport = createTransport({ origin: 'https://api.example.test' });

describe('the builders (SPEC 17.1)', () => {
  it("types a create as the call does, with a lid and local identifiers of each relationship's type", () => {
    void articles.create({
      lid: 'draft',
      attributes: { title: 'T' },
      relationships: {
        author: { type: 'people', lid: 'ada' },
        tags: [
          't1',
          { type: 'tags', lid: 'fresh' },
          { type: 'tags', id: 't2' },
        ],
      },
    });
    // @ts-expect-error -- the validator requires title
    void articles.create({ lid: 'draft' });
    void articles.create({
      attributes: { title: 'T' },
      // @ts-expect-error -- a local identifier of another type
      relationships: { author: { type: 'tags', lid: 'x' } },
    });
    // @ts-expect-error -- articles take no client ids
    void articles.create({ id: 'a1', attributes: { title: 'T' } });
  });

  it('types an update and the relationship writes by the writable lists', () => {
    void articles.update('a1', {
      attributes: { title: 'T' },
      relationships: { tags: [{ type: 'tags', lid: 'fresh' }] },
    });
    // @ts-expect-error -- author is not updatable
    void articles.update('a1', { relationships: { author: 'p1' } });
    void articles.addToRelationship('a1', 'tags', [
      { type: 'tags', lid: 'fresh' },
    ]);
    void articles.removeFromRelationship('a1', 'tags', ['t1']);
    void articles.setRelationship('a1', 'tags', []);
    // @ts-expect-error -- author is not updatable
    void articles.setRelationship('a1', 'author', null);
    // @ts-expect-error -- a to-many takes a list
    void articles.setRelationship('a1', 'tags', 't1');
  });

  it('types each operation by its definition and the data its result holds', () => {
    expectTypeOf(articles.create({ attributes: { title: 'T' } })).toEqualTypeOf<
      Operation<typeof Articles, ArticleRecord>
    >();
    expectTypeOf(articles.update('a1', {})).toEqualTypeOf<
      Operation<typeof Articles, ArticleRecord>
    >();
    expectTypeOf(articles.remove('a1')).toEqualTypeOf<
      Operation<typeof Articles, undefined>
    >();
    expectTypeOf(
      articles.addToRelationship('a1', 'tags', ['t1']),
    ).toEqualTypeOf<Operation<typeof Articles, undefined>>();
  });
});

describe('the results (SPEC 17.2)', () => {
  it('types a tuple of operations as a tuple of results', () => {
    const sent = sendOperations(transport, [
      articles.create({ attributes: { title: 'T' } }),
      articles.remove('a1'),
    ]);

    expectTypeOf<Awaited<typeof sent>['results']>().toEqualTypeOf<
      readonly [OperationResult<ArticleRecord>, OperationResult<undefined>]
    >();
  });

  it('types a list of operations as a list of results', () => {
    const many: ReadonlyArray<Operation<typeof Articles, ArticleRecord>> = [];
    const sent = sendOperations(transport, many);

    expectTypeOf<Awaited<typeof sent>['results']>().toEqualTypeOf<
      ReadonlyArray<OperationResult<ArticleRecord>>
    >();
    expectTypeOf<Awaited<typeof sent>>().toExtend<OperationsResult>();
  });
});
