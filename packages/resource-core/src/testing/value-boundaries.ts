/**
 * The boundary fixtures of a value spec (SPEC 15.3), by its form: the text,
 * number, decimal, and string families, each enum label with near misses,
 * and an array's element fixtures each in an array of its own. A codec's
 * value has none: the codec's own fixtures cover it (SPEC 7.1).
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { ValueForm, ValueSpec } from '../schema/value-form';
import type { BoundaryFixture } from './fixture';

import { ownValue } from '../internal/object';
import { decimalFixtures } from './decimal-boundaries';
import { distinct, fixture } from './fixture';
import { numberFixtures } from './number-boundaries';
import {
  BOOLEAN_FIXTURES,
  JSON_FIXTURES,
  stringFixtures,
} from './string-boundaries';
import { optionFixtures, textFixtures } from './text-boundaries';

type FormOf<TKind extends ValueForm['kind']> = Extract<
  ValueForm,
  { readonly kind: TKind }
>;

type FormFixtures = {
  readonly [K in ValueForm['kind']]: (
    spec: ValueSpec,
    form: FormOf<K>,
    catalog: PublicCatalog,
  ) => ReadonlyArray<BoundaryFixture>;
};

/** Every label of the enum type, so a label an `enum` rule leaves out is probed too. */
function enumFixtures(
  spec: ValueSpec,
  type: string,
  catalog: PublicCatalog,
): ReadonlyArray<BoundaryFixture> {
  const labels = ownValue(catalog.enums, type) ?? spec.options ?? [];
  return [...optionFixtures(labels), fixture('', 'the empty string')];
}

function arrayFixtures(
  element: ValueSpec,
  catalog: PublicCatalog,
): ReadonlyArray<BoundaryFixture> {
  return [
    fixture([], 'an empty array'),
    ...valueFixtures(element, catalog).map(({ value, label }) =>
      fixture([value], `an element: ${label}`),
    ),
  ];
}

const FORM_FIXTURES: FormFixtures = {
  text: (spec) => textFixtures(spec.limits, spec.options),
  number: (spec, form) => numberFixtures(form.type, spec.limits),
  decimal: (spec, form) => decimalFixtures(form.type, spec.limits),
  string: (_spec, form) => stringFixtures(form),
  boolean: () => BOOLEAN_FIXTURES,
  json: () => JSON_FIXTURES,
  enum: (spec, form, catalog) => enumFixtures(spec, form.type, catalog),
  array: (_spec, form, catalog) => arrayFixtures(form.element, catalog),
  codec: () => [],
};

function formFixtures<TKind extends ValueForm['kind']>(
  spec: ValueSpec,
  form: FormOf<TKind>,
  catalog: PublicCatalog,
): ReadonlyArray<BoundaryFixture> {
  const build: (
    spec: ValueSpec,
    form: FormOf<TKind>,
    catalog: PublicCatalog,
  ) => ReadonlyArray<BoundaryFixture> = FORM_FIXTURES[form.kind];
  return build(spec, form, catalog);
}

/** The fixtures of a value, each value once. */
export function valueFixtures(
  spec: ValueSpec,
  catalog: PublicCatalog,
): ReadonlyArray<BoundaryFixture> {
  return distinct(formFixtures(spec, spec.form, catalog));
}
