/**
 * Angular Form over the options (resource SPEC 20.5): `injectForm` takes
 * them as they are and types the form's values and its submit handler's
 * as the model's, and `bindResponseErrors` takes the form it returns and
 * the `formApi` the handler receives. Checked against the built package
 * by the type check only: the component is never created.
 * @ref https://tanstack.com/form/v1/docs/framework/angular/quick-start
 */
import type { ContactClients } from '../../support/recorded-clients.ts';
import type { ContactErrors, ContactValues } from './contact-form.ts';

import { injectForm } from '@tanstack/angular-form';
import { expectTypeOf } from 'vitest';

import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { createContact, submitContact } from './contact-form.ts';

/** A component's form, as its injection context makes it. */
export function angularComponent(clients: ContactClients): void {
  const form = injectForm({
    ...resourceFormOptions(createContact),
    onSubmit: async ({ value, formApi }) => {
      expectTypeOf(value).toEqualTypeOf<ContactValues>();
      await submitContact(clients, formApi, value);
    },
  });
  expectTypeOf(form.state.values).toEqualTypeOf<ContactValues>();
  expectTypeOf(
    bindResponseErrors(form, createContact, null),
  ).toEqualTypeOf<ContactErrors>();
}
