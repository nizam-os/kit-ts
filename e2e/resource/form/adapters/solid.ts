/**
 * Solid Form over the options (resource SPEC 20.5): `createForm` takes
 * them from a function, as Solid reads its options, types the form's
 * values and its submit handler's as the model's, and
 * `bindResponseErrors` takes the form it returns and the `formApi` the
 * handler receives. Checked against the built package by the type check
 * only: the component never renders.
 * @ref https://tanstack.com/form/v1/docs/framework/solid/quick-start
 */
import type { ContactClients } from '../../support/recorded-clients.ts';
import type { ContactErrors, ContactValues } from './contact-form.ts';

import { createForm } from '@tanstack/solid-form';
import { expectTypeOf } from 'vitest';

import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { createContact, submitContact } from './contact-form.ts';

/** A component's form. */
export function solidComponent(clients: ContactClients): void {
  const form = createForm(() => ({
    ...resourceFormOptions(createContact),
    onSubmit: async ({ value, formApi }) => {
      expectTypeOf(value).toEqualTypeOf<ContactValues>();
      await submitContact(clients, formApi, value);
    },
  }));
  expectTypeOf(form.state.values).toEqualTypeOf<ContactValues>();
  expectTypeOf(
    bindResponseErrors(form, createContact, null),
  ).toEqualTypeOf<ContactErrors>();
}
