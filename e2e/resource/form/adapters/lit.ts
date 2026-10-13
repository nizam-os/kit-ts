/**
 * Lit Form over the options (resource SPEC 20.5): a `TanStackFormController`
 * takes them as they are and types its form's values and its submit
 * handler's as the model's, and `bindResponseErrors` takes the controller's
 * `api`, never the controller, and the `formApi` the handler receives.
 * Checked against the built package by the type check only: the element is
 * never defined.
 * @ref https://tanstack.com/form/v1/docs/framework/lit/quick-start
 */
import type { ContactClients } from '../../support/recorded-clients.ts';
import type { ContactErrors, ContactValues } from './contact-form.ts';

import { TanStackFormController } from '@tanstack/lit-form';
import { LitElement } from 'lit';
import { expectTypeOf } from 'vitest';

import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { createContact, submitContact } from './contact-form.ts';

/** An element whose controller holds the form, as Lit Form makes one. */
export class ContactForm extends LitElement {
  public readonly form = new TanStackFormController(this, {
    ...resourceFormOptions(createContact),
    onSubmit: async ({ value, formApi }) => {
      expectTypeOf(value).toEqualTypeOf<ContactValues>();
      await submitContact(this.clients, formApi, value);
    },
  });
  private readonly clients: ContactClients;

  public constructor(clients: ContactClients) {
    super();
    this.clients = clients;
  }
}

/** The element's form, as its controller holds it. */
export function litElement(element: ContactForm): void {
  expectTypeOf(element.form.api.state.values).toEqualTypeOf<ContactValues>();
  expectTypeOf(
    bindResponseErrors(element.form.api, createContact, null),
  ).toEqualTypeOf<ContactErrors>();
  // @ts-expect-error -- the controller is no form; its `api` is
  bindResponseErrors(element.form, createContact, null);
}
