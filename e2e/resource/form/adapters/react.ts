/**
 * React Form over the options (resource SPEC 20.5): `useForm` and the
 * `useAppForm` of `createFormHook` take them as they are and type the
 * form's values and its submit handler's as the model's, and
 * `bindResponseErrors` takes the form each returns and the `formApi` the
 * handler receives. Checked against the built package by the type check
 * only: the screen is never rendered.
 * @ref https://tanstack.com/form/v1/docs/framework/react/guides/basic-concepts
 * @ref https://tanstack.com/form/v1/docs/framework/react/guides/form-composition
 */
import type { ContactClients } from '../../support/recorded-clients.ts';
import type { ContactErrors, ContactValues } from './contact-form.ts';

import {
  createFormHook,
  createFormHookContexts,
  useForm,
} from '@tanstack/react-form';
import { expectTypeOf } from 'vitest';

import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { createContact, submitContact } from './contact-form.ts';

const { fieldContext, formContext } = createFormHookContexts();
const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {},
});

/** A screen's form, in `useForm` and in `useAppForm` alike. */
export function reactScreen(clients: ContactClients): void {
  const form = useForm({
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
  const app = useAppForm({
    ...resourceFormOptions(createContact),
    onSubmit: async ({ value, formApi }) => {
      expectTypeOf(value).toEqualTypeOf<ContactValues>();
      await submitContact(clients, formApi, value);
    },
  });
  expectTypeOf(app.state.values).toEqualTypeOf<ContactValues>();
  bindResponseErrors(app, createContact, null);
}
