/**
 * `bulkActions` (resource SPEC 21.3): one operation per id, in order, as the
 * client sends them in one Atomic Operations request and jsonapi-core's
 * `parseOperationsDocument` reads them back on the server; the cap of one
 * request; and each `TypeError` of `operations` for a list `state` disables.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 */
import type { Operation } from '@nizam-os/jsonapi-client';

import { describe, expect, it } from 'vitest';

import { createTransport, sendOperations } from '@nizam-os/jsonapi-client';
import { parseOperationsDocument } from '@nizam-os/jsonapi-core/atomic';

import { message, text } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
import { bulkActions } from './bulk-actions';

const selection = bulkActions(Contacts, {
  tooMany: message<{ max: number }>(
    ({ max }) => `Höchstens ${max}.`,
    ({ max }) => `At most ${max}.`,
  ),
  actions: {
    restore: {
      label: text('Wiederherstellen', 'Restore'),
      update: {
        attributes: { status: 'active' },
        relationships: { organization: '7' },
      },
    },
    remove: { label: text('Entfernen', 'Remove'), remove: true },
  },
});

/** What one request of `operations` sends: the URL it posts to and its document, read as JSON. */
async function sent(
  operations: ReadonlyArray<Operation>,
): Promise<{ readonly url: string; readonly document: unknown }> {
  const requests: Array<{ readonly url: string; readonly document: unknown }> =
    [];
  const transport = createTransport({
    origin: 'https://api.example.test',
    fetch: async (request) => {
      requests.push({ url: request.url, document: await request.json() });
      return new Response(null, { status: 204 });
    },
  });
  await sendOperations(transport, operations);
  const [request] = requests;
  if (request === undefined || requests.length !== 1) {
    throw new Error('one request was expected');
  }
  return request;
}

describe('the operations of a bulk action (resource SPEC 21.3)', () => {
  it('builds one update per id, in order, which the server reads back from the one request the client sends', async () => {
    const { url, document } = await sent(
      selection.restore.operations(['c2', 'c1']),
    );
    const parsed = parseOperationsDocument(document, {
      maxOperations: selection.restore.max,
    });

    expect(url).toBe('https://api.example.test/api/operations');
    expect(parsed.map(({ op, data }) => ({ op, data }))).toStrictEqual(
      ['c2', 'c1'].map((id) => ({
        op: 'update',
        data: {
          type: 'contacts',
          id,
          attributes: { status: 'active' },
          relationships: {
            organization: { data: { type: 'organizations', id: '7' } },
          },
        },
      })),
    );
  });

  it('builds one removal per id, each naming its record by ref', async () => {
    const { document } = await sent(selection.remove.operations(['c1', 'c3']));
    const parsed = parseOperationsDocument(document, {
      maxOperations: selection.remove.max,
    });

    expect(
      parsed.map(({ op, target, hasData }) => ({ op, target, hasData })),
    ).toEqual([
      { op: 'remove', target: { type: 'contacts', id: 'c1' }, hasData: false },
      { op: 'remove', target: { type: 'contacts', id: 'c3' }, hasData: false },
    ]);
  });

  it("freezes the list, and takes as many ids as one request does: the definition's atomic.max", () => {
    const ids = Array.from(
      { length: selection.remove.max },
      (_, index) => `c${index}`,
    );
    const operations = selection.remove.operations(ids);

    expect(selection.remove.max).toBe(Contacts.resource.atomic.max);
    expect(operations).toHaveLength(ids.length);
    expect(Object.isFrozen(operations)).toBe(true);
  });

  it.each([
    ['a text', 'c1', 'a list of ids'],
    ['a list of numbers', [1, 2], 'a list of ids'],
    ['undefined', undefined, 'a list of ids'],
    ['an empty list', [], 'at least one id'],
    ['an id twice', ['c1', 'c2', 'c1'], 'each id once'],
    [
      'more ids than one request takes',
      Array.from({ length: 11 }, (_, index) => `c${index}`),
      'at most 10 ids',
    ],
  ])(
    'refuses %s, which state disables, before anything is sent',
    (_, ids, takes) => {
      const operations = (given: unknown): unknown =>
        selection.restore.operations(given as ReadonlyArray<string>);

      expect(() => operations(ids)).toThrow(
        new TypeError(`bulkActions: restore.operations takes ${takes}`),
      );
      expect(
        selection.restore.state(ids as ReadonlyArray<string>).disabled,
      ).toBe(true);
    },
  );
});
