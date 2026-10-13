import type {
  ParsedQuery,
  ParsedResourceObject,
  ResourceIdentifier,
} from '@nizam-os/jsonapi-core';

import type { JsonApiContext, JsonApiEnv } from './types';

import { Hono } from 'hono';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineResource } from '@nizam-os/jsonapi-core';

import { jsonApi } from './middleware';
import {
  bodyValidator,
  queryValidator,
  relationshipValidator,
} from './validators';

const Articles = defineResource({
  type: 'articles',
  attributes: ['title'],
  relationships: { author: { type: 'people', cardinality: 'one' } },
  serialize: (row: { id: string }) => ({ id: row.id }),
  query: { sort: ['title', 'createdAt'], filter: { title: ['eq'] } },
  validate: {
    create: z.object({ title: z.string() }),
    update: z.object({ title: z.string().optional() }),
  },
});

interface AppEnv extends JsonApiEnv {
  readonly Bindings: { readonly DB: string };
}

describe('validator typing', () => {
  it('types c.req.valid() and keeps the app Env', () => {
    const app = new Hono<AppEnv>();
    app.use(jsonApi());
    app.get('/articles', queryValidator(Articles), (c) => {
      expectTypeOf(c.req.valid('query')).toEqualTypeOf<
        ParsedQuery<'title' | 'createdAt', 'title'>
      >();
      expectTypeOf(c.get('jsonApi')).toEqualTypeOf<JsonApiContext>();
      expectTypeOf(c.env.DB).toEqualTypeOf<string>();
      return c.body(null, 204);
    });
    app.post(
      '/articles',
      bodyValidator(Articles, { operation: 'create' }),
      (c) => {
        expectTypeOf(c.req.valid('json')).toEqualTypeOf<
          ParsedResourceObject<{ title: string }>
        >();
        return c.body(null, 204);
      },
    );
    app.patch(
      '/articles/:id',
      bodyValidator(Articles, { operation: 'update' }),
      (c) => {
        expectTypeOf(c.req.valid('json').attributes).toEqualTypeOf<{
          title?: string | undefined;
        }>();
        return c.body(null, 204);
      },
    );
    app.patch(
      '/articles/:id/relationships/author',
      relationshipValidator(Articles, 'author', 'one'),
      (c) => {
        expectTypeOf(
          c.req.valid('json'),
        ).toEqualTypeOf<ResourceIdentifier | null>();
        return c.body(null, 204);
      },
    );
  });

  it('only accepts declared relationship names', () => {
    // @ts-expect-error -- "editor" is not a relationship of Articles.
    relationshipValidator(Articles, 'editor', 'one');
  });
});
