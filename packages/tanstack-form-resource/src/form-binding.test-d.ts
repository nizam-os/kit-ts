import type { FormErrors } from '@nizam-os/resource-ui';

import type { BindableForm } from './bind-errors';

import { FieldApi, FormApi } from '@tanstack/form-core';
import { describe, expectTypeOf, it } from 'vitest';

import { createClients, createTransport } from '@nizam-os/jsonapi-client';
import { createDeclareResource } from '@nizam-os/resource-core';
import { contractFixture } from '@nizam-os/resource-core/testing';
import { resourceForm } from '@nizam-os/resource-ui';

import { bindResponseErrors } from './bind-errors';
import { resourceFormOptions } from './form-options';
import { messages } from './test-support/messages';

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
});

const Workspaces = declareResource('workspaces', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Tasks = declareResource('tasks', {
  operations: ['get', 'create'],
  fields: { title: { access: 'readWrite' }, done: { access: 'readWrite' } },
  relationships: {
    workspace_id: { target: () => Workspaces, access: 'readWrite' },
  },
});

const clients = createClients(
  { workspaces: Workspaces.resource, tasks: Tasks.resource },
  createTransport({ origin: 'https://api.example.test' }),
);

const create = resourceForm(Tasks, 'create', { messages });

interface Values {
  readonly title: string;
  readonly done: boolean | null;
  readonly workspace: string;
}

/** A form whose submit handler sends the model's write through the client, and binds a refusal. */
function submitting() {
  return new FormApi({
    ...resourceFormOptions(create),
    onSubmit: async ({ value, formApi }) => {
      expectTypeOf(value).toEqualTypeOf<Values>();
      try {
        await clients.tasks.create(create.write(value));
      } catch (error) {
        expectTypeOf(bindResponseErrors(formApi, create, error)).toEqualTypeOf<
          FormErrors<'title' | 'done' | 'workspace'>
        >();
      }
    },
  });
}

describe('resourceFormOptions with a form-core FormApi (resource SPEC 20.5)', () => {
  it("types a form's values as the model's", () => {
    const form = new FormApi({ ...resourceFormOptions(create) });
    expectTypeOf(form.state.values).toEqualTypeOf<Values>();
  });

  it("hands the submit handler values the model's write takes, for the client's create", () => {
    expectTypeOf(submitting).toBeFunction();
  });

  it('gives a field every error as an object with a message', () => {
    const form = new FormApi({ ...resourceFormOptions(create) });
    const field = new FieldApi({ form, name: 'title' });
    expectTypeOf(field.state.meta.errors[0]?.message).toEqualTypeOf<
      string | undefined
    >();
  });
});

describe('bindResponseErrors with a form-core FormApi (resource SPEC 20.5)', () => {
  it('takes the formApi of a submit handler and a FormApi made with new, of any submit meta', () => {
    expectTypeOf(submitting).returns.toExtend<BindableForm<Values>>();
    bindResponseErrors(submitting(), create, null);
    bindResponseErrors(
      new FormApi({ ...resourceFormOptions(create) }),
      create,
      null,
    );
    bindResponseErrors(
      new FormApi({
        ...resourceFormOptions(create),
        onSubmitMeta: { action: 'save' },
      }),
      create,
      null,
    );
  });

  it('refuses a form that lacks a member the model holds, and takes one that holds more', () => {
    const titles = resourceForm(Tasks, 'create', {
      messages,
      members: ['title'],
    });
    const narrow = new FormApi({ ...resourceFormOptions(titles) });
    const wide = new FormApi({ ...resourceFormOptions(create) });
    // @ts-expect-error -- the form holds no `done` or `workspace`
    bindResponseErrors(narrow, create, null);
    bindResponseErrors(wide, titles, null);
  });
});
