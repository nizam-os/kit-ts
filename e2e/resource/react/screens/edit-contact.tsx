/**
 * The contacts application's edit screen (resource SPEC 20.5): the record
 * TanStack Query reads, an update model built from it again whenever it
 * changes, as the README's form rules ask, TanStack Form over its
 * options, and a submit that sends the model's write through
 * `resourceQueries`' `update`, so only what the person changed travels,
 * measured against the record as it refetched after the last save.
 */
import type { ReactElement } from 'react';

import type { Contact, ContactQueries } from '../../support/contact-queries.ts';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fieldsOf, resourceForm } from '@nizam-os/resource-ui';
import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { contactMessages } from '../../localization/contact-messages.ts';
import { Contacts } from '../../resources/contacts.ts';
import { ChoiceInput, TextInput } from './inputs.tsx';

const contactFields = fieldsOf(Contacts, contactMessages);

interface EditProps {
  readonly api: ContactQueries;
  readonly id: string;
}

/** The form over one record, built again only when the record changes. */
function EditForm({
  api,
  id,
  record,
}: EditProps & { readonly record: Contact }): ReactElement {
  const editContact = useMemo(
    () =>
      resourceForm(Contacts, 'update', {
        messages: contactMessages,
        record,
        members: ['name', 'nickname', 'status'],
      }),
    [record],
  );
  const update = useMutation(api.contacts.update());
  const form = useForm({
    ...resourceFormOptions(editContact),
    onSubmit: async ({ value, formApi }) => {
      try {
        await update.mutateAsync({ id, ...editContact.write(value) });
      } catch (error) {
        bindResponseErrors(formApi, editContact, error);
      }
    },
  });
  return (
    <form
      aria-label="Kontakt bearbeiten"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <TextInput field={field} label={contactFields.name.label()} />
        )}
      </form.Field>
      <form.Field name="nickname">
        {(field) => (
          <TextInput field={field} label={contactFields.nickname.label()} />
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
      <button type="submit" disabled={update.isPending}>
        Speichern
      </button>
      {update.isSuccess && <p role="status">Gespeichert</p>}
    </form>
  );
}

/** The contact `id`, loaded, then its form. */
export function EditContact({ api, id }: EditProps): ReactElement {
  const contact = useQuery(api.contacts.get(id));
  if (contact.data === undefined) {
    return <p>Lädt</p>;
  }
  return <EditForm api={api} id={id} record={contact.data.data} />;
}
