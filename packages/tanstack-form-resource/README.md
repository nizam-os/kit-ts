# @nizam-os/tanstack-form-resource

[TanStack Form](https://tanstack.com/form/v1) options and refusals for
[`@nizam-os/resource-ui`](https://github.com/nizam-os/kit-ts/tree/main/packages/resource-ui#readme)'s
form models, which the form of every adapter takes as they are: React's, Vue's, Solid's, Svelte's,
Angular's, and Lit's. `resourceFormOptions(model)` gives a form the model's values and its
validator, run when the form is first submitted and on every change after, so nobody meets an error
before submitting, and `bindResponseErrors(form, model, error)` puts a refused write's texts on
their fields. The package binds `@tanstack/form-core`, the core every adapter is built on, and
imports no framework and no adapter. The contract is section 20.5 of
[`docs/resource/SPEC.md`](https://github.com/nizam-os/kit-ts/blob/main/docs/resource/SPEC.md), and
the decisions behind it
[ADR 0017](https://github.com/nizam-os/kit-ts/blob/main/docs/resource/adr/0017-a-refusal-of-several-fields-binds-where-a-change-to-any-clears-it.md)
and
[ADR 0018](https://github.com/nizam-os/kit-ts/blob/main/docs/resource/adr/0018-forms-and-lists-are-a-model-and-a-tanstack-form-binding-in-two-packages.md).

Status: in development and unreleased.

## Install

```bash
pnpm add @nizam-os/tanstack-form-resource @nizam-os/resource-ui @nizam-os/resource-core @nizam-os/jsonapi-client
pnpm add @tanstack/react-form
```

Install your adapter alone: `@tanstack/react-form`, `@tanstack/vue-form`, `@tanstack/solid-form`,
`@tanstack/svelte-form`, `@tanstack/angular-form`, or `@tanstack/lit-form`, at 1.17 or later. Each
depends on one exact release of `@tanstack/form-core`, which this package takes as an optional peer
from 1.17, the first release with `revalidateLogic`. It imports that function and types alone from
it, so the form runs your adapter's copy. Do not list `@tanstack/form-core` yourself: a range of
your own installs a second copy once a newer release is published, and the form then runs the
validation logic of another release than its own
([ADR 0011](https://github.com/nizam-os/kit-ts/blob/main/docs/adr/0011-a-binding-takes-the-core-an-adapter-brings-as-an-optional-peer.md)).
Under Yarn Plug'n'Play, which gives a package no peer its parent does not provide, list it at the
exact release your adapter depends on, which `yarn why @tanstack/form-core` shows.

`@nizam-os/resource-ui` is a peer dependency: the binding reads the form models your application
builds with its own copy
([ADR 0006](https://github.com/nizam-os/kit-ts/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)),
and `@nizam-os/resource-core` and `@nizam-os/jsonapi-client` are its peers.

## Forms

Build the model with `@nizam-os/resource-ui`'s
[`resourceForm`](https://github.com/nizam-os/kit-ts/tree/main/packages/resource-ui#forms):

```ts
// src/contacts/forms.ts
import { resourceForm } from '@nizam-os/resource-ui';

import { messages } from '../localization/messages';
import { Contacts } from '../resources/contacts';

export const createContact = resourceForm(Contacts, 'create', { messages });
```

Spread `resourceFormOptions(model)` into your adapter's form, write through the client in the submit
handler, and bind a refusal with the `formApi` the handler receives. `bindResponseErrors` returns
the texts it bound, with the ones no field holds for a banner:

```tsx
// src/contacts/create-contact.tsx
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';

import { bindResponseErrors, resourceFormOptions } from '@nizam-os/tanstack-form-resource';

import { clients } from '../api/clients';
import { createContact } from './forms';

export function CreateContact() {
  const [banner, setBanner] = useState<ReadonlyArray<string>>([]);
  const form = useForm({
    ...resourceFormOptions(createContact),
    onSubmit: async ({ value, formApi }) => {
      setBanner([]);
      try {
        await clients.contacts.create(createContact.write(value));
      } catch (error) {
        const refusal = bindResponseErrors(formApi, createContact, error);
        const placed = Object.keys(refusal.fields).length > 0 || refusal.form.length > 0;
        setBanner(placed ? refusal.form : ['The contact could not be saved. Try again.']);
      }
    },
  });
  return (
    <form
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
      {createContact.fields.map((descriptor) => (
        <form.Field key={descriptor.name} name={descriptor.name}>
          {(field) => (
            <label>
              {descriptor.label()}
              <input
                value={String(field.state.value ?? '')}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched && field.state.meta.errors[0]?.message}
            </label>
          )}
        </form.Field>
      ))}
      <button type="submit">Save</button>
    </form>
  );
}
```

A real screen renders each member with the control its descriptor calls for; the loop keeps the
example short. A screen that writes through TanStack Query sends `createContact.write(value)` to
`mutateAsync` of the create from
[`@nizam-os/tanstack-query-jsonapi`](https://github.com/nizam-os/kit-ts/tree/main/packages/tanstack-query-jsonapi#queries)
instead.

Every adapter takes the same options, as it takes its own, and `bindResponseErrors` takes the form
it makes:

| Adapter      | The form                                                                        | What `bindResponseErrors` takes |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------- |
| React Form   | `useForm({ ...resourceFormOptions(model), onSubmit })`                          | the form, or `formApi`          |
| Vue Form     | `useForm({ ...resourceFormOptions(model), onSubmit })`                          | the form, or `formApi`          |
| Solid Form   | `createForm(() => ({ ...resourceFormOptions(model), onSubmit }))`               | the form, or `formApi`          |
| Svelte Form  | `createForm(() => ({ ...resourceFormOptions(model), onSubmit }))`               | the form, or `formApi`          |
| Angular Form | `injectForm({ ...resourceFormOptions(model), onSubmit })`                       | the form, or `formApi`          |
| Lit Form     | `new TanStackFormController(this, { ...resourceFormOptions(model), onSubmit })` | `controller.api`, or `formApi`  |

`resourceFormOptions(model)` spreads into the `useAppForm` of React's `createFormHook` the same way,
so your own field components keep working. The form's values, and the values the submit handler
receives, are typed as the model's, which is what `model.write` takes.

## Refusals

Where a refusal lands, and when it goes (ADR 0017):

| The server refuses                                                                 | The text is the field's | It goes when                           |
| ---------------------------------------------------------------------------------- | ----------------------- | -------------------------------------- |
| one field, such as a taken email                                                   | `errorMap.onSubmit`     | that field changes or loses focus      |
| several fields together, such as a room booked twice for one period (room, period) | `errorMap.onServer`     | any field of the form changes or blurs |
| a member the form holds but renders no field for, or no member                     | the returned `form`     | the next binding                       |

Either field error blocks the next submit until it goes, so the values the server refused are not
sent again unchanged. Each binding first clears the texts the one before it set, and leaves every
other error a field holds. An error that is no `ResponseError` of the client binds nothing.

## Best practices

- **Spread `resourceFormOptions(model)` and add your own options after it,** never in place of its
  `validators` or `validationLogic`: they run the model's validator, and the form's own validation
  is what clears a refusal of several fields. A form without a form-level validator keeps it.
- **Render a field for every member the model holds, and pass `members` to hold fewer.** A validator
  issue on a member without a field blocks the submit unseen; the binding sends such a member's
  refusal to the banner instead.
- **Bind in the submit handler's `catch`, with the `formApi` it receives,** and show the returned
  `form` texts in a banner. When `fields` and `form` are both empty, as for a network failure or a
  `500` without an error document, show your own text; an error's `message` is for logs.
- **Read a refusal from what `bindResponseErrors` returned, never from `isSubmitSuccessful`:**
  TanStack Form sets it to `true` once the handler resolves, and a handler that catches the refusal
  resolves.
- **Render `field.state.meta.errors[0]?.message`.** Every error a field holds is an object with a
  `message`, the validator's issue and the server's text alike; the binding marks the field touched,
  so a field that shows its errors once touched shows a refusal too.
- **Let your messages read the locale, as Paraglide's do.** A field shows the validator's texts in
  the locale of the moment they ran, and the server's text in the language the transport sent with
  the request, as the server localized it; a refusal keeps that text until it goes.
- **Hand Lit's `controller.api` to `bindResponseErrors`, not the controller.** `resourceFormOptions`
  and `bindResponseErrors` throw `TypeError` for a model no `resourceForm` returned, and
  `bindResponseErrors` for a form that is no TanStack Form `FormApi`. The form's values must hold
  the model's members; TypeScript refuses a form made from another model.

## Documentation

- [`docs/resource/SPEC.md`](https://github.com/nizam-os/kit-ts/blob/main/docs/resource/SPEC.md),
  section 20.5: the binding's contract, with the tests that prove it
- [ADR 0017](https://github.com/nizam-os/kit-ts/blob/main/docs/resource/adr/0017-a-refusal-of-several-fields-binds-where-a-change-to-any-clears-it.md):
  a refusal of several fields binds where a change to any clears it, and
  [ADR 0018](https://github.com/nizam-os/kit-ts/blob/main/docs/resource/adr/0018-forms-and-lists-are-a-model-and-a-tanstack-form-binding-in-two-packages.md):
  forms and lists are a model and a TanStack Form binding in two packages
- [ADR 0010](https://github.com/nizam-os/kit-ts/blob/main/docs/adr/0010-a-binding-to-a-library-with-a-framework-free-core-binds-the-core.md)
  and
  [ADR 0011](https://github.com/nizam-os/kit-ts/blob/main/docs/adr/0011-a-binding-takes-the-core-an-adapter-brings-as-an-optional-peer.md):
  a binding binds a library's framework-free core, and takes it as an optional peer

## License

MIT
