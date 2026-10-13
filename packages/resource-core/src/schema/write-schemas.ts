/**
 * The write validators of a resource (SPEC 6.2, 6.5): a create or an
 * update as `@nizam-os/jsonapi-core` parses it, `{ attributes,
 * relationships }`, the attributes keyed by public name and each
 * relationship as its `data`. Each part is validated by its object schema,
 * and the multi-column CHECKs over both fields and relationships run here,
 * the one place every member is in view. Issue paths start with
 * `attributes` or `relationships`; in the document, a relationship's path
 * continues under its `data` member.
 * @packageDocumentation
 */
import type { $ZodCheck } from 'zod/v4/core';

import type { MemberSpec } from './field-spec';
import type { FindMember, MemberInfo } from './issues';
import type {
  CheckMember,
  MemberLocation,
  MultiColumnCheck,
} from './multi-column';
import type { ObjectSchemas } from './object-schemas';
import type { RelationshipSpec } from './relationship-specs';
import type { ResourceValidator } from './validate';

import { z } from 'zod/v4';

import { overFields } from './attribute-schemas';
import { linkageId, overRelationships } from './linkage-schemas';
import { memberFinder, memberInfo } from './member-info';
import { checkRefinements } from './multi-column';
import { standardValidator } from './validate';

/** The write validators of a resource. */
export interface WriteValidators {
  readonly create: ResourceValidator;
  readonly update: ResourceValidator;
}

/** A linkage's issues: its JSON types are `object` and `string`, and no codec owns it. */
const LINKAGE_INFO: MemberInfo = {
  integer: false,
  integerElements: false,
  codec: undefined,
};

function locate(member: CheckMember): MemberLocation {
  return member.kind === 'field'
    ? { path: ['attributes', member.name], read: (value) => value }
    : { path: ['relationships', member.name], read: linkageId };
}

function mixedRefinements(
  attributes: z.ZodObject,
  relationships: z.ZodObject,
  checks: ReadonlyArray<MultiColumnCheck>,
): ReadonlyArray<$ZodCheck<object>> {
  const holds = (member: CheckMember): boolean =>
    Object.hasOwn(
      member.kind === 'field' ? attributes.shape : relationships.shape,
      member.name,
    );
  return checks
    .filter((check) => check.members.every((member) => holds(member)))
    .flatMap((check) => checkRefinements(check, locate));
}

function writeSchema(
  attributes: z.ZodObject,
  relationships: z.ZodObject,
  checks: ReadonlyArray<MultiColumnCheck>,
): z.ZodType {
  const schema = z.strictObject({ attributes, relationships });
  const refinements = mixedRefinements(attributes, relationships, checks);
  return refinements.length === 0 ? schema : schema.check(...refinements);
}

function writeFinder(
  fields: ReadonlyArray<MemberSpec>,
  relationships: ReadonlyArray<RelationshipSpec>,
): FindMember {
  const inAttributes = memberFinder(
    new Map(fields.map((field) => [field.name, memberInfo(field.value)])),
    1,
  );
  const inRelationships = memberFinder(
    new Map(relationships.map(({ name }) => [name, LINKAGE_INFO])),
    1,
  );
  return (path) => {
    if (path[0] === 'attributes') {
      return inAttributes(path);
    }
    return path[0] === 'relationships' ? inRelationships(path) : undefined;
  };
}

/** The write validators over the attribute and linkage schemas, with the CHECKs that span both. */
export function writeValidators(
  members: {
    readonly fields: ReadonlyArray<MemberSpec>;
    readonly relationships: ReadonlyArray<RelationshipSpec>;
    readonly checks: ReadonlyArray<MultiColumnCheck>;
  },
  schema: ObjectSchemas,
  linkage: ObjectSchemas,
): WriteValidators {
  const mixed = members.checks.filter(
    (check) => !overFields(check) && !overRelationships(check),
  );
  const findMember = writeFinder(members.fields, members.relationships);
  return Object.freeze({
    create: standardValidator(
      writeSchema(schema.create, linkage.create, mixed),
      findMember,
    ),
    update: standardValidator(
      writeSchema(schema.update, linkage.update, mixed),
      findMember,
    ),
  });
}
