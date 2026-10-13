/**
 * The client's runtime checks (SPEC 14.2, 15.9, 17.5):
 * `@nizam-os/jsonapi-client` calls a blog of its own through that blog's
 * `fetch`, its calls and its Atomic Operations, inside the runtime under
 * test, so the client's module graph loads and runs where the app does.
 * `app.ts` answers `GET /client-checks` with the outcome, which each harness
 * reports beside the app's checks. Web standards only, as the client itself.
 */
import type { Clients, Transport } from '@nizam-os/jsonapi-client';

import type { InRuntimeCheck, SmokeResult } from './checks.ts';

import {
  createClients,
  createTransport,
  cursorOf,
  isResponseError,
  operationOf,
  operationsOf,
  pageCursors,
  sendOperations,
} from '@nizam-os/jsonapi-client';

import { createBlog } from '../support/blog.ts';
import { Articles, People, Tags } from '../support/resources.ts';
import { check, equal, runInRuntime } from './checks.ts';

/** Where the client believes the blog is; each request is answered in-process. */
const ORIGIN = 'http://client.invalid';
const JSON_API = 'application/vnd.api+json';
const ATOMIC_MEDIA_TYPE = `${JSON_API}; ext="https://jsonapi.org/ext/atomic"`;
const DEFINITIONS = { articles: Articles, people: People, tags: Tags };

interface ClientBlog {
  readonly api: Clients<typeof DEFINITIONS>;
  readonly transport: Transport;
  /** The requests the client handed to fetch, in order. */
  readonly sent: ReadonlyArray<Request>;
}

/** A fresh blog and clients over it, each request's token numbered. */
function openBlog(): ClientBlog {
  const { app } = createBlog();
  const sent: Array<Request> = [];
  const transport = createTransport({
    origin: ORIGIN,
    headers: () => ({ authorization: `Bearer ${String(sent.length)}` }),
    language: () => 'de',
    fetch: async (request) => {
      sent.push(request);
      return app.fetch(request);
    },
  });
  return { api: createClients(DEFINITIONS, transport), transport, sent };
}

async function refusal(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new TypeError('the call resolved');
}

const CHECKS: Readonly<Record<string, InRuntimeCheck>> = {
  'pages of records along the links': async () => {
    const { articles } = openBlog().api;
    const first = await articles.list({ sort: ['title'], include: ['author'] });
    equal(first.data.map((row) => row.id).join(), '3,4', 'first page');
    equal(pageCursors(first).next, btoa('4'), 'next cursor');
    const last = first.data.at(-1);
    equal(
      last === undefined ? undefined : cursorOf(last),
      btoa('4'),
      'item cursor',
    );
    const second = await articles.next(first);
    equal(second?.data.map((row) => row.id).join(), '1,5', 'second page');
    equal(second?.data[0]?.author?.name, 'Dan Gebhardt', 'included author');
  },
  'a compound record with a sparse fieldset': async () => {
    const { data } = await openBlog().api.articles.get('1', {
      include: ['tags'],
      fields: { articles: ['title', 'tags'], tags: ['name'] },
    });
    equal(data.title, 'JSON:API paints my bikeshed!', 'title');
    check(!('body' in data), 'body left out');
    equal(data.tags?.map((tag) => tag.name).join(), 'json,api', 'tags');
  },
  'create, update, and remove': async () => {
    const { articles } = openBlog().api;
    const created = await articles.create({
      attributes: { title: 'Everywhere' },
      relationships: { author: '2', tags: ['t3'] },
    });
    equal(created.status, 201, 'create status');
    equal(created.data?.id, '6', 'created id');
    equal(created.data?.tags?.[0]?.id, 't3', 'created tags');
    const updated = await articles.update('6', { attributes: { body: 'B' } });
    equal(updated.data?.body, 'B', 'updated body');
    const removed = await articles.remove('6');
    equal(removed.status, 204, 'remove status');
    equal(removed.data, undefined, 'remove data');
  },
  'relationship calls': async () => {
    const { articles } = openBlog().api;
    equal(
      (await articles.setRelationship('1', 'author', '3')).status,
      204,
      'set status',
    );
    equal(
      (await articles.relationship('1', 'author')).data?.id,
      '3',
      'linkage',
    );
    equal(
      (await articles.related('1', 'author')).data?.name,
      'Grace Hopper',
      'related',
    );
    await articles.addToRelationship('2', 'tags', ['t3']);
    const tags = await articles.relationship('2', 'tags');
    equal(tags.data.map((tag) => tag.id).join(), 't2,t3', 'added tags');
  },
  'refusals into ResponseError and TypeError': async () => {
    const { api, sent } = openBlog();
    const missing = await refusal(api.articles.get('999'));
    check(isResponseError(missing, 'NOT_FOUND'), 'a 404 is a ResponseError');
    equal(missing.message, 'articles get answered 404', 'message');
    const invalid = await refusal(
      api.articles.create({ attributes: { title: '' } }),
    );
    check(
      isResponseError(invalid, 'VALIDATION_FAILED'),
      'a 422 is a ResponseError',
    );
    equal(
      invalid.errors[0]?.source?.pointer,
      '/data/attributes/title',
      'pointer',
    );
    const before = sent.length;
    const dots = await refusal(api.articles.get('..'));
    check(dots instanceof TypeError, 'a dot segment id is a TypeError');
    equal(sent.length, before, 'nothing sent');
  },
  'operations in one request, linked by lid and refused at their index':
    async () => {
      const { transport, sent } = openBlog();
      const { status, results } = await sendOperations(transport, [
        operationsOf(People).create({
          lid: 'ada',
          attributes: { name: 'Ada' },
        }),
        operationsOf(Articles).create({
          attributes: { title: 'Linked' },
          relationships: { author: { type: 'people', lid: 'ada' } },
        }),
      ]);
      equal(status, 200, 'status');
      equal(results[0].data?.id, '6', 'created person');
      equal(results[1].data?.author?.id, '6', 'linked by lid');
      equal(
        sent[0]?.headers.get('content-type'),
        ATOMIC_MEDIA_TYPE,
        'extension applied',
      );
      const refused = await refusal(
        sendOperations(transport, [
          operationsOf(Articles).update('1', { attributes: { title: 'Kept' } }),
          operationsOf(Articles).remove('404'),
        ]),
      );
      check(
        isResponseError(refused, 'NOT_FOUND'),
        'a refusal is a ResponseError',
      );
      equal(
        refused.errors.map((object) => operationOf(object)?.index).join(),
        '1',
        'at its operation',
      );
    },
  'headers and language on every request': async () => {
    const { api, sent } = openBlog();
    await api.articles.get('1');
    await api.articles.update('1', { attributes: { body: 'B' } });
    const [read, write] = sent;
    equal(read?.headers.get('authorization'), 'Bearer 0', 'first token');
    equal(write?.headers.get('authorization'), 'Bearer 1', 'second token');
    equal(write?.headers.get('accept-language'), 'de', 'language');
    equal(read?.headers.get('accept'), JSON_API, 'accept');
    equal(read?.headers.get('content-type'), null, 'no content type on a read');
    equal(
      write?.headers.get('content-type'),
      JSON_API,
      'content type of a write',
    );
  },
};

/** Runs every check in the current runtime; one report covers them all. */
export async function runClientChecks(): Promise<SmokeResult> {
  return runInRuntime(CHECKS);
}
