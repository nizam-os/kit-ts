import type { ErrorItem } from '@nizam-os/ban-core';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createBan, fromRequest } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';

import { defineValidator } from '../codecs/define-validator';
import { errorCatalog } from '../errors/error-catalog';
import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { defaultMessages } from './default-messages';
import { defineMessages } from './define-messages';
import { localizeErrors } from './localize-errors';
import { localizeIssues } from './localize-issues';

// A CHECK over a relationship and one over a field and a relationship, as
// write-schemas.test.ts builds them: only `write` runs the second (SPEC 6.2).
const INT4 = { type: 'int4', sqlType: 'integer' };
const declareTask = untypedDeclare(
  catalogOf({
    owners: table('owners', {
      id: column({ ...INT4, nullable: false, identity: 'always' }),
    }),
    tasks: table(
      'tasks',
      {
        id: column({ ...INT4, nullable: false, identity: 'always' }),
        note: column(),
        owner_id: column(INT4),
      },
      {
        tasks_owner_id_fkey: {
          kind: 'foreignKey',
          columns: ['owner_id'],
          references: { table: 'owners', columns: ['id'] },
          enforced: true,
        },
        tasks_owner_check: {
          kind: 'check',
          columns: ['owner_id'],
          rule: null,
          enforced: true,
        },
        tasks_owner_or_note: {
          kind: 'check',
          columns: ['owner_id', 'note'],
          rule: null,
          enforced: true,
        },
      },
    ),
  }),
  {
    validators: {
      notThirteen: defineValidator({
        schema: z
          .string()
          .nullable()
          .refine((id) => id !== '13'),
        fixtures: { accept: ['1', null], reject: ['13'] },
      }),
      ownerOrNote: defineValidator({
        schema: z
          .object({ owner: z.string().nullable(), note: z.string().nullable() })
          .refine(({ owner, note }) => owner !== null || note !== null),
        fixtures: {
          accept: [{ owner: '1', note: null }],
          reject: [{ owner: null, note: null }],
        },
      }),
    },
  },
);
const Owners = declareTask('owners', { operations: ['get'], fields: {} });
const Tasks = declareTask('tasks', {
  operations: ['create', 'update'],
  fields: { note: { access: 'readWrite' } },
  relationships: { owner_id: { target: () => Owners, access: 'readWrite' } },
  rules: {
    tasks_owner_check: { validator: 'notThirteen' },
    tasks_owner_or_note: { validator: 'ownerOrNote' },
  },
});
const REQUEST = fromRequest(new Request('https://api.test/tasks'));

describe('localizeIssues on relationships (SPEC 10.5)', () => {
  it("gives a validator's issues on a relationship and on a field the texts of its code, as on the items the runtime makes", async () => {
    const TASKS = [Owners, Tasks] as const;
    const defaults = defaultMessages(TASKS);
    const taskMessages = defineMessages(
      TASKS,
      {},
      {
        ...defaults,
        constraints: {
          ...defaults.constraints,
          check: {
            title: () => 'Ungültiger Wert',
            detail: ({ field }) => `${field} verletzt eine Regel.`,
          },
        },
        fields: {
          ...defaults.fields,
          tasks: { note: () => 'Notiz', owner: () => 'Verantwortlich' },
        },
      },
    );
    const tasksBan = createBan({
      errors: { ...ERROR_CATALOG, ...errorCatalog(TASKS) },
      format: jsonApi({ mixedEntries: true, includeId: false }),
    });
    const handle = tasksBan.handler({
      transform: localizeErrors(taskMessages, { resource: () => 'tasks' }),
    });
    const write = (relationships: unknown) =>
      Tasks.write.create['~standard'].validate({
        attributes: { note: null },
        relationships,
      }).issues ?? [];
    const issues = [
      ...write({ owner: { type: 'owners', id: '13' } }),
      ...write({ owner: null }),
    ];
    // SPEC 9.3: a relationship's issue points under the relationship's `data`.
    const items: Array<ErrorItem> = issues.map((issue) => ({
      detail: issue.message,
      path:
        issue.path[0] === 'relationships'
          ? ['data', ...issue.path, 'data']
          : ['data', ...issue.path],
      reason: issue.code,
    }));
    const response = await handle(
      tasksBan.error('VALIDATION_FAILED', { errors: items }),
      REQUEST,
      null,
    );
    const body = (await response.json()) as {
      errors: Array<{ detail: string }>;
    };
    const textOf = localizeIssues(taskMessages);
    const texts = issues.map((issue) => textOf('tasks', issue));
    expect(texts).toStrictEqual(body.errors.map(({ detail }) => detail));
    expect(texts).toStrictEqual([
      'Verantwortlich verletzt eine Regel.',
      'Verantwortlich verletzt eine Regel.',
      'Notiz verletzt eine Regel.',
    ]);
  });
});
