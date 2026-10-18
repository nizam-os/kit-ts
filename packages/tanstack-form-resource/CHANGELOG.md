# @nizam-os/tanstack-form-resource

## 0.1.0

### Minor Changes

- [#180](https://github.com/nizam-os/kit-ts/pull/180) [`2bd79f0`](https://github.com/nizam-os/kit-ts/commit/2bd79f044e9291f0e08f766d863b825d0f4f661d) Thanks [@ali-issa](https://github.com/ali-issa)! - New package: TanStack Form options and refusals for `@nizam-os/resource-ui`'s form models, which the
  form of every adapter takes as they are: React's, Vue's, Solid's, Svelte's, Angular's, and Lit's.
  `resourceFormOptions(model)` gives a form the model's values and its validator, run when the form is
  first submitted and on every change after, under the `revalidateLogic` of `@tanstack/form-core`, an
  optional peer from 1.17, so the form runs its adapter's own copy.
  `bindResponseErrors(form, model, error)` puts a refused write's texts on their fields and returns
  them, with the ones no field holds for a banner. A refusal of one field stays on it until that field
  changes or loses focus; a refusal of several fields together, such as a room booked twice for one
  period, goes when any field changes, since changing either answers it. Either blocks a submit of the
  same values. `@nizam-os/resource-ui` is a peer dependency.

### Patch Changes

- Updated dependencies [[`8a2cc03`](https://github.com/nizam-os/kit-ts/commit/8a2cc03db49d2f70ca2fe442c66ecf3e6c953b55), [`6c828e2`](https://github.com/nizam-os/kit-ts/commit/6c828e2131717bdf35c9bba9ebd4270ab5888a7d), [`9587f29`](https://github.com/nizam-os/kit-ts/commit/9587f2964869379031b751c0523eda286fc63f55), [`0c8c6fa`](https://github.com/nizam-os/kit-ts/commit/0c8c6fa3d316be3b1fa0cc1c1d64885ca9e61735), [`62ac31e`](https://github.com/nizam-os/kit-ts/commit/62ac31eb17f0af291fece99fe7f0c9812694d066), [`a6156da`](https://github.com/nizam-os/kit-ts/commit/a6156da956e0ba2204158a21338c8689623a66ef)]:
  - @nizam-os/resource-ui@0.1.0
