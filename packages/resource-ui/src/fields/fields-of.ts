/**
 * `fieldsOf(resource, messages)` (resource SPEC 20.2): a descriptor per
 * public field and relationship, for a form's inputs and a table's columns.
 * A descriptor holds the messages' own functions, never their texts, so
 * descriptors built once at startup render in the locale of each render
 * (ADR 0014). Its facts are the field metadata's (SPEC 8): what a create
 * must carry, what sorts, and which operators filter, with the kind of
 * control a filter takes.
 * @packageDocumentation
 */
import type { FieldMeta, Label, Messages } from '@nizam-os/resource-core';

import type { DeclaredShape } from '../internal/declared';
import type { TypeLabels } from '../internal/labels';
import type { FilterKind } from './filter-kind';

import { checkDeclared } from '../internal/declared';
import { typeLabels } from '../internal/labels';
import { filterKind, optionValues } from './filter-kind';

const CALLER = 'fieldsOf';

/** One option of a member: the value a request carries and the messages' label of it. */
export interface FieldOption {
  readonly value: string;
  readonly label: Label;
}

/** A member's filter: the control it takes and the operators it may write. */
export interface ColumnFilterDescriptor {
  readonly kind: FilterKind;
  /** The member's declared `filter`, in order. */
  readonly operators: FieldMeta['filter'];
}

/** One public field or relationship, as a form's input and a table's column read it. */
export interface FieldDescriptor<TName extends string = string> {
  /** The public name: a form field's name and a table column's id. */
  readonly name: TName;
  /** The messages' label of the member, `messages.fields[type][name]`. */
  readonly label: Label;
  /**
   * The member's options, or else its elements', in order, each with the
   * messages' label of it; `null` when neither has options, and for a
   * relationship, whose ids are the target's records.
   */
  readonly options: ReadonlyArray<FieldOption> | null;
  /** Whether a create must carry the member. */
  readonly required: boolean;
  readonly sortable: boolean;
  /** `null` when the member declares no `filter`. */
  readonly filter: ColumnFilterDescriptor | null;
  /** The member's metadata, `resource.fields[name]`. */
  readonly meta: FieldMeta;
}

/** The descriptors of `TResource`, keyed by its public names. */
export type FieldDescriptors<TResource extends DeclaredShape> = {
  readonly [K in keyof TResource['fields'] & string]: FieldDescriptor<K>;
};

function optionsOf(
  labels: TypeLabels,
  meta: FieldMeta,
): ReadonlyArray<FieldOption> | null {
  const values = optionValues(meta);
  if (meta.kind === 'relationship' || values === null) {
    return null;
  }
  return Object.freeze(
    values.map((value) =>
      Object.freeze({ value, label: labels.option(meta.name, value) }),
    ),
  );
}

function filterOf(meta: FieldMeta): ColumnFilterDescriptor | null {
  return meta.filter.length === 0
    ? null
    : Object.freeze({ kind: filterKind(meta), operators: meta.filter });
}

function descriptorOf(labels: TypeLabels, meta: FieldMeta): FieldDescriptor {
  return Object.freeze({
    name: meta.name,
    label: labels.member(meta.name),
    options: optionsOf(labels, meta),
    required: meta.required,
    sortable: meta.sortable,
    filter: filterOf(meta),
    meta,
  });
}

/**
 * The descriptor of each of `resource`'s public fields and relationships,
 * in `fields` order, labeled by `messages`; `caller` names the function in
 * each `TypeError`, as `fieldsOf` documents them.
 */
export function descriptorsOf(
  caller: string,
  resource: DeclaredShape,
  messages: Messages,
): ReadonlyArray<FieldDescriptor> {
  checkDeclared(caller, resource);
  const labels = typeLabels(caller, messages, resource.names.type);
  return Object.values(resource.fields).map((meta) =>
    descriptorOf(labels, meta),
  );
}

/**
 * The descriptors of `resource`'s public fields and relationships, keyed by
 * public name in `fields` order, labeled by `messages`; frozen. Throws
 * `TypeError` for a resource no `declareResource` returned, for messages no
 * definer returned, and for messages that label no member of the
 * resource's type.
 */
export function fieldsOf<TResource extends DeclaredShape>(
  resource: TResource,
  messages: Messages,
): FieldDescriptors<TResource> {
  const descriptors = Object.fromEntries(
    descriptorsOf(CALLER, resource, messages).map((descriptor) => [
      descriptor.name,
      descriptor,
    ]),
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: one descriptor per member of `fields`, keyed by its public name, which `FieldDescriptors` maps
  return Object.freeze(descriptors) as FieldDescriptors<TResource>;
}
