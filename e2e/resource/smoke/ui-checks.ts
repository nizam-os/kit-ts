/**
 * Checks of the built `@nizam-os/resource-ui` (resource SPEC 20.8, 21.5):
 * the models, which import no framework and nothing of TanStack, describe
 * the contacts application's members and run a form model, its start
 * values, its validator, its write, and the error mapping of a refused
 * write; a list model, which reads a stale link back leniently and pages
 * by a page's links; and a bulk action, which builds a selection's
 * operations, disables a selection over the cap, and places a refusal on
 * the record of its operation; and a mistake throws the documented
 * `TypeError`. The messages are `defaultMessages`', constant in every
 * runtime, since no request sets a locale here. No Node.js API, so the
 * same module runs on Bun, Deno, and workerd, where server rendering runs.
 */
import type { Checks } from './report.ts';

import { ResponseError } from '@nizam-os/jsonapi-client';
import { defaultMessages } from '@nizam-os/resource-core';
import {
  bulkActions,
  fieldsOf,
  resourceForm,
  resourceList,
} from '@nizam-os/resource-ui';

import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';
import { check } from './report.ts';

const messages = defaultMessages([Organizations, Contacts]);

/** The `TypeError` message of calling `fn` with `args` as JavaScript would, types erased. */
function messageOf(
  fn: (...args: never) => unknown,
  args: ReadonlyArray<unknown>,
): string {
  try {
    Reflect.apply(fn, undefined, args);
  } catch (error) {
    if (error instanceof TypeError) {
      return error.message;
    }
    throw error;
  }
  return 'no TypeError';
}

export const uiChecks: Checks = {
  'describes the members with their labels and filters': () => {
    const fields = fieldsOf(Contacts, messages);
    const { status, priority } = fields;
    check(status.label() === 'Status', status.label());
    check(
      status.options?.map(({ value }) => value).join() === 'active,archived',
      JSON.stringify(status.options),
    );
    check(priority.filter?.kind === 'number', String(priority.filter?.kind));
  },
  'starts a create form from the defaults and refuses a blank name': () => {
    const create = resourceForm(Contacts, 'create', { messages });
    const { kind, discount, tags } = create.defaultValues;
    check(kind === 'person' && discount === '0', `${kind} ${discount}`);
    check(Array.isArray(tags) && Object.isFrozen(tags), 'tags');
    const result = create.validator['~standard'].validate(create.defaultValues);
    const issues = 'issues' in result ? result.issues : [];
    check(
      JSON.stringify(issues) ===
        JSON.stringify([{ message: 'A value is required.', path: ['name'] }]),
      JSON.stringify(issues),
    );
  },
  'writes what changed, as the client sends it': () => {
    const create = resourceForm(Contacts, 'create', { messages });
    const write = create.write({
      ...create.defaultValues,
      name: 'Ada',
      priority: '3',
    });
    check(
      JSON.stringify(write) ===
        JSON.stringify({ attributes: { name: 'Ada', priority: 3 } }),
      JSON.stringify(write),
    );
  },
  "places a refused write's error objects on their fields": () => {
    const create = resourceForm(Contacts, 'create', { messages });
    const error = new ResponseError({
      type: 'contacts',
      call: 'create',
      status: 409,
      body: {
        errors: [
          {
            status: '409',
            code: 'CONTACT_EMAIL_TAKEN',
            detail: 'Email already belongs to another contact.',
            source: { pointer: '/data/attributes/email' },
          },
        ],
      },
    });
    const { fields, form } = create.errors(error);
    check(
      fields.email === 'Email already belongs to another contact.' &&
        form.length === 0,
      JSON.stringify(fields),
    );
  },
  'reads a stale link back leniently and pages by the links': () => {
    const list = resourceList(Contacts, messages);
    const state = list.query(
      'sort=nickname&filter[status][in]=active&page[size]=500&page[after]=c1&include=organization',
    );
    check(
      JSON.stringify(state) ===
        JSON.stringify({
          filter: { status: { in: 'active' } },
          page: { after: 'c1' },
        }),
      JSON.stringify(state),
    );
    const next = list.next(list.withPageSize(state, 2), {
      data: [{ id: '1' }],
      links: { next: '/api/contacts?page%5Bsize%5D=2&page%5Bafter%5D=c3' },
    });
    check(
      list.params(next ?? {}).toString() ===
        'page%5Bsize%5D=2&page%5Bafter%5D=c3&filter%5Bstatus%5D%5Bin%5D=active',
      list.params(next ?? {}).toString(),
    );
  },
  "builds a selection's operations and places a refusal on the record of its operation":
    () => {
      const { archive } = bulkActions(Contacts, {
        tooMany: ({ max }) => `At most ${String(max)} at once.`,
        actions: {
          archive: {
            label: () => 'Archive',
            update: { attributes: { status: 'archived' } },
          },
        },
      });
      const ids = ['c1', 'c2'];
      const sent = archive.operations(ids).map(({ op, data }) => [op, data]);
      check(
        JSON.stringify(sent) ===
          JSON.stringify(
            ids.map((id) => [
              'update',
              { type: 'contacts', id, attributes: { status: 'archived' } },
            ]),
          ),
        JSON.stringify(sent),
      );
      const over = Array.from({ length: archive.max + 1 }, (_, index) =>
        String(index),
      );
      check(
        archive.state(over).reason === 'At most 10 at once.',
        JSON.stringify(archive.state(over)),
      );
      const { records, form } = archive.errors(
        new ResponseError({
          type: 'contacts',
          call: 'operations',
          status: 409,
          body: {
            errors: [
              {
                status: '409',
                detail: 'Name already taken.',
                source: {
                  pointer: '/atomic:operations/1/data/attributes/name',
                },
              },
            ],
          },
        }),
        ids,
      );
      check(
        records['c2']?.fields.name === 'Name already taken.' &&
          records['c1'] === undefined &&
          form.length === 0,
        JSON.stringify({ records, form }),
      );
    },
  'refuses an operation it does not write': () => {
    const message = messageOf(resourceForm, [Contacts, 'remove', { messages }]);
    check(
      message === 'resourceForm: operation must be create or update',
      message,
    );
  },
};
