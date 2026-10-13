/**
 * `@nizam-os/tanstack-form-resource`: a form model bound to TanStack Form's
 * framework-free core, so the form of every adapter takes it (resource
 * SPEC 20.5, root ADR 0010). `resourceFormOptions` gives a form the
 * model's values and validator, and `bindResponseErrors` puts a refused
 * write's texts on its fields. `@tanstack/form-core` is an optional peer,
 * the copy the application's adapter brings (root ADR 0011).
 * @packageDocumentation
 */
export type { BindableForm } from './bind-errors';
export type { ResourceFormOptions } from './form-options';

export { bindResponseErrors } from './bind-errors';
export { resourceFormOptions } from './form-options';
