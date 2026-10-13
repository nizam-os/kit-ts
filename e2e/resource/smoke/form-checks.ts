/**
 * Checks of the built `@nizam-os/tanstack-form-resource` (resource SPEC
 * 20.8): a form-core `FormApi` made with `resourceFormOptions`, as every
 * adapter's form is made, with a mounted `FieldApi` per member, refuses a
 * first submit with the model's issue on its field, hands its handler the
 * values once they validate, and takes a refused write's text onto its
 * field through `bindResponseErrors`, so a form validates where server
 * rendering runs. The messages are `defaultMessages`', constant in every
 * runtime. No Node.js API, so the same module runs on Bun, Deno, and
 * workerd.
 */
import type { Checks } from './report.ts';

import { FieldApi, FormApi } from '@tanstack/form-core';

import { ResponseError } from '@nizam-os/jsonapi-client';
import { defaultMessages } from '@nizam-os/resource-core';
import { resourceForm } from '@nizam-os/resource-ui';
import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';
import { check } from './report.ts';

const messages = defaultMessages([Organizations, Contacts]);
const create = resourceForm(Contacts, 'create', {
  messages,
  members: ['name', 'email'],
});

const TAKEN = 'Email already belongs to another contact.';

/** A mounted form over `create`, a field per member, whose handler records each submit's values. */
function mountCreate() {
  const submitted: Array<unknown> = [];
  const form = new FormApi({
    ...resourceFormOptions(create),
    onSubmit: ({ value }) => {
      submitted.push(value);
    },
  });
  form.mount();
  const name = new FieldApi({ form, name: 'name' });
  const email = new FieldApi({ form, name: 'email' });
  name.mount();
  email.mount();
  return { form, name, email, submitted };
}

/** What a field component renders of `errors`, a field's: their messages. */
function shown(
  errors: ReadonlyArray<{ readonly message: string } | undefined>,
): string {
  return errors.map((error) => error?.message).join();
}

export const formChecks: Checks = {
  "refuses a form's first submit with the model's issue on its field":
    async () => {
      const { form, name, submitted } = mountCreate();
      await form.handleSubmit();
      check(submitted.length === 0, JSON.stringify(submitted));
      const errors = shown(name.state.meta.errors);
      check(errors === 'A value is required.', errors);
    },
  'hands the handler the values once they validate': async () => {
    const { form, name, submitted } = mountCreate();
    name.handleChange('Ada');
    await form.handleSubmit();
    check(
      JSON.stringify(submitted) ===
        JSON.stringify([{ name: 'Ada', email: '' }]),
      JSON.stringify(submitted),
    );
    check(form.state.isSubmitSuccessful, 'the submit did not succeed');
  },
  "binds a refused write's text onto its field": () => {
    const { form, email } = mountCreate();
    const bound = bindResponseErrors(
      form,
      create,
      new ResponseError({
        type: 'contacts',
        call: 'create',
        status: 409,
        body: {
          errors: [
            {
              status: '409',
              code: 'CONTACT_EMAIL_TAKEN',
              detail: TAKEN,
              source: { pointer: '/data/attributes/email' },
            },
          ],
        },
      }),
    );
    check(
      bound.fields.email === TAKEN && bound.form.length === 0,
      JSON.stringify(bound),
    );
    const errors = shown(email.state.meta.errors);
    check(errors === TAKEN, errors);
  },
};
