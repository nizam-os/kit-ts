---
'@nizam-os/tanstack-form-resource': minor
---

New package: TanStack Form options and refusals for `@nizam-os/resource-ui`'s form models, which the
form of every adapter takes as they are: React's, Vue's, Solid's, Svelte's, Angular's, and Lit's.
`resourceFormOptions(model)` gives a form the model's values and its validator, run when the form is
first submitted and on every change after, under the `revalidateLogic` of `@tanstack/form-core`, an
optional peer from 1.17, so the form runs its adapter's own copy.
`bindResponseErrors(form, model, error)` puts a refused write's texts on their fields and returns
them, with the ones no field holds for a banner. A refusal of one field stays on it until that field
changes or loses focus; a refusal of several fields together, such as a room booked twice for one
period, goes when any field changes, since changing either answers it. Either blocks a submit of the
same values. `@nizam-os/resource-ui` is a peer dependency.
