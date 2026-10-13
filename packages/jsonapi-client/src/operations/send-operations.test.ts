/**
 * `sendOperations` (SPEC 17.2) through a fetch double: one `POST` of every
 * operation to the operations path, the extension on both negotiation
 * headers, a 200 read into a result per operation and a 204 into empty
 * ones; and each `TypeError` before anything is sent.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-clients
 */
import type { Answer } from '../test-support/fetch-double';
import type { Transport } from '../transport/transport';

import { describe, expect, it } from 'vitest';

import { createDefineResource, defineResource } from '@nizam-os/jsonapi-core';

import { Articles, People } from '../test-support/blog';
import { empty, fetchDouble, jsonApi } from '../test-support/fetch-double';
import { createTransport } from '../transport/transport';
import { operationsOf } from './operations-of';
import { sendOperations } from './send-operations';

const ORIGIN = 'https://api.example.test';
const ATOMIC = 'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"';
const articles = operationsOf(Articles);
const people = operationsOf(People);
const STORED = {
  type: 'articles',
  id: 'a9',
  attributes: { title: 'T', body: 'B' },
};

function transportWith(...answers: ReadonlyArray<Answer>) {
  const double = fetchDouble(...answers);
  return {
    double,
    transport: createTransport({ origin: ORIGIN, fetch: double.fetch }),
  };
}

describe('sendOperations: the request (SPEC 17.2)', () => {
  it('POSTs every operation in one document to the operations path, under the extension on Content-Type and Accept', async () => {
    const { double, transport } = transportWith(
      jsonApi({
        'atomic:results': [{ data: STORED }, {}],
        meta: { took: 3 },
      }),
    );

    const result = await sendOperations(
      transport,
      [
        articles.create({ lid: 'a', attributes: { title: 'T', body: 'B' } }),
        people.remove('p1'),
      ],
      { headers: { 'X-Request-Id': 'r1' } },
    );

    const sent = double.last();
    expect([sent.method, sent.url]).toStrictEqual([
      'POST',
      `${ORIGIN}/api/operations`,
    ]);
    expect([
      sent.headers.get('content-type'),
      sent.headers.get('accept'),
      sent.headers.get('x-request-id'),
    ]).toStrictEqual([ATOMIC, ATOMIC, 'r1']);
    expect(JSON.parse(sent.body)).toStrictEqual({
      'atomic:operations': [
        {
          op: 'add',
          data: {
            type: 'articles',
            lid: 'a',
            attributes: { title: 'T', body: 'B' },
          },
        },
        { op: 'remove', ref: { type: 'people', id: 'p1' } },
      ],
    });
    expect(result).toStrictEqual({
      status: 200,
      results: [
        {
          data: { type: 'articles', id: 'a9', title: 'T', body: 'B' },
          meta: undefined,
        },
        { data: undefined, meta: undefined },
      ],
      links: undefined,
      meta: { took: 3 },
      jsonapi: undefined,
    });
  });

  it('reads a 204 as every result empty, "if all results are empty"', async () => {
    const { transport } = transportWith(empty(204));

    const result = await sendOperations(transport, [
      articles.remove('a1'),
      articles.setRelationship('a2', 'author', null),
    ]);

    expect(result.results).toStrictEqual([
      { data: undefined, meta: undefined },
      { data: undefined, meta: undefined },
    ]);
  });
});

describe('sendOperations: refused before sending (SPEC 17.2)', () => {
  const Elsewhere = createDefineResource({
    links: { base: 'https://blog.example/v2' },
  })({
    type: 'notes',
    attributes: ['text'],
    serialize: (row: { readonly id: string; readonly text: string }) => ({
      id: row.id,
      attributes: { text: row.text },
    }),
  });
  const Unlinked = defineResource({
    type: 'drafts',
    attributes: ['text'],
    serialize: (row: { readonly id: string; readonly text: string }) => ({
      id: row.id,
      attributes: { text: row.text },
    }),
  });

  it.each([
    [
      'a transport createTransport did not make',
      (_transport: Transport) => [{} as Transport, [articles.remove('a1')]],
      'sendOperations: transport must be made by createTransport',
    ],
    [
      'an empty list',
      (transport: Transport) => [transport, []],
      'sendOperations: operations must be a non-empty list of operations',
    ],
    [
      'an operation outside a list',
      (transport: Transport) => [transport, articles.remove('a1')],
      'sendOperations: operations must be a non-empty list of operations',
    ],
    [
      'a value that is not an operation, by its index',
      (transport: Transport) => [
        transport,
        [articles.remove('a1'), { definition: Articles, op: 'upsert' }],
      ],
      'sendOperations: operations[1] is not an operation of operationsOf',
    ],
    [
      'operations whose definitions name different operations paths',
      (transport: Transport) => [
        transport,
        [articles.remove('a1'), operationsOf(Elsewhere).remove('n1')],
      ],
      "sendOperations: the operations' definitions name different operations paths (/api/operations, /v2/operations); one request reaches one endpoint",
    ],
    [
      'a definition whose links give no paths',
      (transport: Transport) => [
        transport,
        [operationsOf(Unlinked).remove('d1')],
      ],
      'sendOperations: drafts has no links.self, so its paths are unknown; give the definer links.base',
    ],
  ])('throws TypeError for %s', async (_, argumentsOf, message) => {
    const { double, transport } = transportWith();
    const [to, operations] = argumentsOf(transport) as Parameters<
      typeof sendOperations
    >;

    await expect(sendOperations(to, operations)).rejects.toThrow(
      new TypeError(message),
    );
    expect(double.sent).toHaveLength(0);
  });
});
