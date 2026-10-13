/**
 * The contacts application's create screen, as the README writes one
 * (resource SPEC 20.5): TanStack Form over `resourceFormOptions` of a
 * model built once with the application's Paraglide messages, a submit
 * that sends the model's write through `resourceQueries`' `create`, which
 * refetches the lists on screen, and a refusal bound onto the fields,
 * what no field holds in the banner, and the screen's own text when the
 * refusal places nothing.
 */
import type { ReactElement } from 'react';

import type { ContactQueries } from '../../support/contact-queries.ts';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { fieldsOf, resourceForm } from '@nizam-os/resource-ui';
import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { contactMessages } from '../../localization/contact-messages.ts';
import { Contacts } from '../../resources/contacts.ts';
import { ChoiceInput, TextInput } from './inputs.tsx';

/** The screen's own text when a refusal places nothing. */
const NOT_SAVED = 'Der Kontakt wurde nicht gespeichert.';

/** Built once, at startup; the texts read the locale of each render. */
const createContact = resourceForm(Contacts, 'create', {
  messages: contactMessages,
  members: ['name', 'email', 'website', 'status'],
});
const contactFields = fieldsOf(Contacts, contactMessages);

/** A form that creates a contact. */
export function CreateContact({
  api,
}: {
  readonly api: ContactQueries;
}): ReactElement {
  const [banner, setBanner] = useState<ReadonlyArray<string>>([]);
  const create = useMutation(api.contacts.create());
  const form = useForm({
    ...resourceFormOptions(createContact),
    onSubmit: async ({ value, formApi }) => {
      setBanner([]);
      try {
        await create.mutateAsync(createContact.write(value));
        formApi.reset();
      } catch (error) {
        const refusal = bindResponseErrors(formApi, createContact, error);
        const placed =
          Object.keys(refusal.fields).length > 0 || refusal.form.length > 0;
        setBanner(placed ? refusal.form : [NOT_SAVED]);
      }
    },
  });
  return (
    <form
      aria-label="Kontakt anlegen"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {banner.map((text) => (
        <p key={text} role="alert">
          {text}
        </p>
      ))}
      <form.Field name="name">
        {(field) => (
          <TextInput field={field} label={contactFields.name.label()} />
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <TextInput field={field} label={contactFields.email.label()} />
        )}
      </form.Field>
      <form.Field name="website">
        {(field) => (
          <TextInput field={field} label={contactFields.website.label()} />
        )}
      </form.Field>
      <form.Field name="status">
        {(field) => (
          <ChoiceInput
            field={field}
            label={contactFields.status.label()}
            options={contactFields.status.options ?? []}
          />
        )}
      </form.Field>
      <button type="submit" disabled={create.isPending}>
        Speichern
      </button>
    </form>
  );
}
