/**
 * A declared resource's JSON:API definition (SPEC 11.1): the
 * `@nizam-os/jsonapi-core` resource that the definer's `defineResource`
 * builds with the definer's `links`. Its attributes are every field's
 * public name, `write` fields included, so requests may carry them;
 * `writable` lists the members each write carries by their access, so the
 * parser refuses a `read` member on create or update and an `immutable`
 * one on update with 403 (SPEC 9.4), and a client id is validated by the
 * key's form (SPEC 3.4); `serialize` turns a public row into
 * its readable fields and relationship ids and never emits a `write` field;
 * its filters, sorts, and page are the ones the keyset definition beside it
 * holds (`keyset-definition.ts`). It reads every relationship's target for
 * the target's type, so the declared resource builds it on first read
 * (SPEC 3.8).
 * @ref https://github.com/nizam-os/kit-ts/blob/main/docs/jsonapi/SPEC.md (sections 5 and 5.2)
 * @packageDocumentation
 */
import type {
  AnyResource,
  DefineResource,
  RelationshipDefinition,
  SerializedResource,
} from '@nizam-os/jsonapi-core';

import type { KeysetMembers } from '../declare/check-filters';
import type { ResolvedPage } from '../declare/check-page';
import type { Declaration, Operation } from '../declare/types';
import type { ResourceNames } from '../names/types';
import type { AttributeValidators } from '../schema/attribute-schemas';
import type { ResourceSpecs } from '../schema/resource-specs';
import type { PublicRow } from '../server/storage';

import { ownValue } from '../internal/object';
import { schemaHolds } from '../schema/object-schemas';
import { SEARCH_PARAMETER } from './query-names';

/** What a JSON:API definition is built from: the checked declaration, its specs, and the definer's `defineResource`. */
export interface ResourceSource {
  readonly defineResource: DefineResource;
  readonly declaration: Declaration;
  readonly names: ResourceNames;
  readonly specs: ResourceSpecs;
  readonly members: KeysetMembers;
  readonly page: ResolvedPage;
  readonly operations: ReadonlySet<Operation>;
  readonly validate: AttributeValidators;
}

/** The members of `row` among `names` that it holds. */
function pick(
  row: PublicRow,
  names: ReadonlyArray<string>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    names
      .filter((name) => Object.hasOwn(row, name))
      .map((name) => [name, row[name]]),
  );
}

/** A relationship's linkage in a public row: the target's id, or `null`; the message names the member, never its value. */
function linkage(type: string, name: string, value: unknown): string | null {
  if (typeof value !== 'string' && value !== null) {
    throw new TypeError(
      `${type}.serialize: relationship "${name}" must be a target id or null`,
    );
  }
  return value;
}

/** `serialize` over a public row: its readable fields and its relationship ids. */
function serializer(
  type: string,
  specs: ResourceSpecs,
): (row: PublicRow) => SerializedResource<string, string> {
  const readable = specs.fields
    .filter((spec) => spec.access !== 'write')
    .map((spec) => spec.name);
  const linked = specs.relationships.map((spec) => spec.name);
  return (row) => ({
    id: row.id,
    ...(specs.fields.length === 0 ? {} : { attributes: pick(row, readable) }),
    ...(linked.length === 0
      ? {}
      : {
          relationships: Object.fromEntries(
            Object.entries(pick(row, linked)).map(([name, value]) => [
              name,
              linkage(type, name, value),
            ]),
          ),
        }),
  });
}

/** Each relationship by public name: its target's type, read on first use, and the target's own definition. */
function relationshipsOf(
  specs: ResourceSpecs,
): Readonly<Record<string, RelationshipDefinition>> {
  return Object.fromEntries(
    specs.relationships.map((spec) => [
      spec.name,
      {
        type: spec.target().names.type,
        cardinality: 'one',
        resource: () => spec.target().resource,
      },
    ]),
  );
}

/** The public names of the fields and relationships each write carries (SPEC 3.1). */
function writableMembers(specs: ResourceSpecs): {
  readonly create: ReadonlyArray<string>;
  readonly update: ReadonlyArray<string>;
} {
  const members = [...specs.fields, ...specs.relationships];
  const carried = (write: 'create' | 'update'): ReadonlyArray<string> =>
    members
      .filter((spec) => schemaHolds(write, spec.access))
      .map((spec) => spec.name);
  return { create: carried('create'), update: carried('update') };
}

/** The public names of the relationships a client may include. */
function includable(source: ResourceSource): ReadonlyArray<string> {
  const declared = source.declaration.relationships ?? {};
  return source.specs.relationships
    .filter((spec) => ownValue(declared, spec.column)?.include === true)
    .map((spec) => spec.name);
}

/** The JSON:API definition of a declaration that passed every check. */
export function resourceDefinition(source: ResourceSource): AnyResource {
  const { declaration, names, specs, members, operations, validate } = source;
  return source.defineResource({
    type: names.type,
    attributes: specs.fields.map((spec) => spec.name),
    relationships: relationshipsOf(specs),
    serialize: serializer(names.type, specs),
    query: {
      sort: members.members
        .filter((member) => member.sortable)
        .map((member) => member.spec.name),
      filter: Object.fromEntries(
        members.members
          .filter((member) => member.operators.length > 0)
          .map((member) => [member.spec.name, member.operators]),
      ),
      include: includable(source),
      page: source.page,
      ...(declaration.search === undefined ? {} : { search: SEARCH_PARAMETER }),
    },
    validate: {
      ...(operations.has('create') ? { create: validate.create } : {}),
      ...(operations.has('update') ? { update: validate.update } : {}),
      id: validate.id,
    },
    writable: writableMembers(specs),
    clientIds: declaration.clientIds === true,
  });
}
