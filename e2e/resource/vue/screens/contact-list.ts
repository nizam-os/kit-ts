/**
 * The contacts application's list as a Vue application writes it (resource
 * SPEC 20.6, 20.7, 21.3), a render function in place of a single-file
 * component's template: the list model's state in a `shallowRef`, replaced
 * whole on each change as the model returns a new one; the page Vue Query's
 * `useQuery` reads for it, its options from a getter, so a new state reads
 * its own page; a search the person submits; a button per contact that
 * removes them through `useMutation` of `resourceQueries`' `remove`, which
 * refetches the list; and a checkbox per contact whose selection a bar of
 * `bulkActions` removes in one Atomic Operations request through
 * `useMutation` of `operationsMutation`, which refetches the list too.
 * @ref https://tanstack.com/query/v5/docs/framework/vue/reactivity ("reactive getters")
 * @ref https://vuejs.org/api/reactivity-advanced.html#shallowref
 * @ref https://tanstack.com/query/v5/docs/framework/vue/guides/invalidations-from-mutations
 */
import type { BulkAction, ListState } from '@nizam-os/resource-ui';

import type {
  Contact,
  ContactActionQueries,
} from '../../support/contact-queries.ts';

import { useMutation, useQuery } from '@tanstack/vue-query';
import { defineComponent, h, shallowRef } from 'vue';

import { bulkActions, fieldsOf, resourceList } from '@nizam-os/resource-ui';

import { contactMessages } from '../../localization/contact-messages.ts';
import { m } from '../../localization/paraglide/messages.js';
import { Contacts } from '../../resources/contacts.ts';

/** Built once, at startup, beside the descriptors. */
const contactsList = resourceList(Contacts, contactMessages);
const contactFields = fieldsOf(Contacts, contactMessages);
const selectionActions = bulkActions(Contacts, {
  tooMany: m.selection_too_many,
  actions: {
    remove: {
      label: m.contacts_remove,
      tone: 'danger',
      remove: true,
      done: m.contacts_removed,
    },
  },
});
const barActions = Object.values(selectionActions);
const noContacts: ReadonlyArray<Contact> = [];

/** The text of the input named `name` in the form `event` submits. */
function submitted(event: Event, name: string): string {
  const text =
    event.currentTarget instanceof HTMLFormElement
      ? new FormData(event.currentTarget).get(name)
      : null;
  return typeof text === 'string' ? text : '';
}

/** `ids` with `id` added, or without it when it holds it. */
function toggled(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  if (!next.delete(id)) {
    next.add(id);
  }
  return next;
}

/** The editor's contacts, a search over them, a removal per contact, and a bar over the selected. */
export const ContactList = defineComponent(
  (props: { readonly api: ContactActionQueries }) => {
    const state = shallowRef<ListState<typeof Contacts>>(
      contactsList.query({}),
    );
    const selected = shallowRef<ReadonlySet<string>>(new Set());
    const done = shallowRef('');
    const result = useQuery(() => props.api.contacts.list(state.value));
    const remove = useMutation(props.api.contacts.remove());
    const operations = useMutation(props.api.operations);
    const contacts = () => result.data.value?.data ?? noContacts;
    const runOnSelection = (
      action: BulkAction<typeof Contacts>,
      ids: ReadonlyArray<string>,
    ) => {
      done.value = '';
      operations.mutate(action.operations(ids), {
        onSuccess: () => {
          selected.value = new Set();
          done.value = action.done?.({ count: ids.length }) ?? '';
        },
      });
    };
    const bar = (ids: ReadonlyArray<string>) =>
      h(
        'div',
        { role: 'toolbar', 'aria-label': 'Auswahl' },
        barActions.map((action) => {
          const { visible, disabled, reason } = action.state(ids);
          return visible
            ? h(
                'button',
                {
                  key: action.name,
                  type: 'button',
                  disabled: disabled || operations.isPending.value,
                  title: reason ?? undefined,
                  onClick: () => {
                    runOnSelection(action, ids);
                  },
                },
                action.label(),
              )
            : null;
        }),
      );
    const row = (contact: Contact) =>
      h('tr', { key: contact.id }, [
        h(
          'td',
          h('input', {
            type: 'checkbox',
            'aria-label': `${contact.name} auswählen`,
            checked: selected.value.has(contact.id),
            onChange: () => {
              selected.value = toggled(selected.value, contact.id);
            },
          }),
        ),
        h('td', contact.name),
        h('td', contact.email ?? ''),
        h(
          'td',
          h(
            'button',
            {
              type: 'button',
              'aria-label': `${contact.name} entfernen`,
              disabled: remove.isPending.value,
              onClick: () => {
                remove.mutate(contact.id);
              },
            },
            'Entfernen',
          ),
        ),
      ]);
    return () => [
      h(
        'form',
        {
          role: 'search',
          onSubmit: (event: Event) => {
            event.preventDefault();
            state.value = contactsList.withSearch(
              state.value,
              submitted(event, 'search'),
            );
          },
        },
        h('input', { name: 'search', type: 'search', 'aria-label': 'Suche' }),
      ),
      // The selected contacts the page shows, in its order.
      bar(
        contacts()
          .filter(({ id }) => selected.value.has(id))
          .map(({ id }) => id),
      ),
      h('table', [
        h(
          'thead',
          h('tr', [
            h('th'),
            h('th', contactFields.name.label()),
            h('th', contactFields.email.label()),
            h('th'),
          ]),
        ),
        h(
          'tbody',
          contacts().map((contact) => row(contact)),
        ),
      ]),
      h('p', { role: 'status' }, done.value),
    ];
  },
  { name: 'ContactList', props: ['api'] },
);
