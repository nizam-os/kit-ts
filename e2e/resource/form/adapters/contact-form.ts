/**
 * The form every adapter check makes (resource SPEC 20.5): the contacts
 * application's create form of a contact's name and email, built once
 * with its Paraglide messages, the values an adapter must type the form's
 * state and its submit handler's with, and the submit an application's
 * handler runs, which sends the model's write through the built client
 * and binds a refusal onto the form. Read by the type check only.
 */
import type { FormErrors } from '@nizam-os/resource-ui';
import type { BindableForm } from '@nizam-os/tanstack-form-resource';

import type { ContactClients } from '../../support/recorded-clients.ts';

import { resourceForm } from '@nizam-os/resource-ui';
import { bindResponseErrors } from '@nizam-os/tanstack-form-resource';

import { contactMessages } from '../../localization/contact-messages.ts';
import { Contacts } from '../../resources/contacts.ts';

export const createContact = resourceForm(Contacts, 'create', {
  messages: contactMessages,
  members: ['name', 'email'],
});

/** The create form's values, as the model types them. */
export interface ContactValues {
  readonly name: string;
  readonly email: string;
}

/** What a refused create binds, by member. */
export type ContactErrors = FormErrors<'name' | 'email'>;

/**
 * A submit handler's work: the model's write through the client, and the
 * refusal bound onto `form`, the `formApi` the handler receives.
 */
export async function submitContact(
  clients: ContactClients,
  form: BindableForm<ContactValues>,
  value: ContactValues,
): Promise<ContactErrors | undefined> {
  try {
    await clients.contacts.create(createContact.write(value));
    return undefined;
  } catch (error) {
    return bindResponseErrors(form, createContact, error);
  }
}
