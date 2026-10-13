/**
 * The contacts application's create form as a Vue application writes it
 * (resource SPEC 20.5), a render function in place of a single-file
 * component's template: Vue Form's `useForm` over `resourceFormOptions` of
 * a model built once with the application's Paraglide messages, a submit
 * that sends the model's write through Vue Query's `useMutation` of
 * `resourceQueries`' `create`, which refetches the lists on screen, and a
 * refusal bound onto the fields with `bindResponseErrors`, what no field
 * holds in the banner, and the screen's own text when the refusal places
 * nothing.
 * @ref https://tanstack.com/form/v1/docs/framework/vue/quick-start
 * @ref https://tanstack.com/query/v5/docs/framework/vue/guides/mutations
 * @ref https://vuejs.org/api/general.html#definecomponent (the function signature, its props declared at runtime)
 */
import type { ContactQueries } from '../../support/contact-queries.ts';
import type { FieldSlot } from './inputs.ts';

import { useForm } from '@tanstack/vue-form';
import { useMutation } from '@tanstack/vue-query';
import { defineComponent, h, ref } from 'vue';

import { fieldsOf, resourceForm } from '@nizam-os/resource-ui';
import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { contactMessages } from '../../localization/contact-messages.ts';
import { Contacts } from '../../resources/contacts.ts';
import { textInput } from './inputs.ts';

/** The screen's own text when a refusal places nothing. */
const NOT_SAVED = 'Der Kontakt wurde nicht gespeichert.';

/** Built once, at startup; the texts read the locale of each render. */
const createContact = resourceForm(Contacts, 'create', {
  messages: contactMessages,
  members: ['name', 'email'],
});
const contactFields = fieldsOf(Contacts, contactMessages);

/** A form that creates a contact. */
export const CreateContact = defineComponent(
  (props: { readonly api: ContactQueries }) => {
    const banner = ref<ReadonlyArray<string>>([]);
    const create = useMutation(props.api.contacts.create());
    const form = useForm({
      ...resourceFormOptions(createContact),
      onSubmit: async ({ value, formApi }) => {
        banner.value = [];
        try {
          await create.mutateAsync(createContact.write(value));
          formApi.reset();
        } catch (error) {
          const refusal = bindResponseErrors(formApi, createContact, error);
          const placed =
            Object.keys(refusal.fields).length > 0 || refusal.form.length > 0;
          banner.value = placed ? refusal.form : [NOT_SAVED];
        }
      },
    });
    return () =>
      h(
        'form',
        {
          'aria-label': 'Kontakt anlegen',
          onSubmit: (event: Event) => {
            event.preventDefault();
            void form.handleSubmit();
          },
        },
        [
          ...banner.value.map((text) =>
            h('p', { key: text, role: 'alert' }, text),
          ),
          h(
            form.Field,
            { name: 'name' },
            {
              default: ({ field }: FieldSlot) =>
                textInput(field, contactFields.name.label()),
            },
          ),
          h(
            form.Field,
            { name: 'email' },
            {
              default: ({ field }: FieldSlot) =>
                textInput(field, contactFields.email.label()),
            },
          ),
          h(
            'button',
            { type: 'submit', disabled: create.isPending.value },
            'Speichern',
          ),
        ],
      );
  },
  { name: 'CreateContact', props: ['api'] },
);
