/**
 * The properties of SPEC 15.2 for one declared resource, each the list of
 * places where the resource and the model disagree: what create requires,
 * what read holds, the codes, the limits, the keyset fields, and each
 * member's nullability, requiredness, and options. The property test runs
 * it over generated catalogs and the real-world records over real
 * declarations, so both hold the code to the one model.
 * Not published with the package.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { DeclaredResource } from '../../declare/declared-resource';
import type { Subject } from './check-support';
import type { ModelDeclaration, ModelMember } from './members';

import { limitsProblems } from './check-limits';
import { differ, sorted, valueSource } from './check-support';
import { expectedCodes } from './codes';
import { effectivelyNotNull, requiredOnInsert } from './insert';
import { enumValuesOf, keysetTypeOf } from './keyset';
import { columnRules, levelOf } from './value-levels';

/** Each property's disagreements; every list is empty when the resource agrees. */
export interface PropertyProblems {
  readonly create: ReadonlyArray<string>;
  readonly read: ReadonlyArray<string>;
  readonly codes: ReadonlyArray<string>;
  readonly limits: ReadonlyArray<string>;
  readonly keyset: ReadonlyArray<string>;
  readonly meta: ReadonlyArray<string>;
}

interface Parses {
  readonly safeParse: (value: unknown) => {
    readonly error?: {
      readonly issues: ReadonlyArray<{
        readonly path: ReadonlyArray<PropertyKey>;
      }>;
    };
  };
}

const BOOLEAN_IDS = ['false', 'true'];

/** The members a parse of `{}` reports missing. */
function requiredKeys(schema: Parses): Array<string> {
  return sorted(
    (schema.safeParse({}).error?.issues ?? []).map(({ path }) =>
      String(path[0]),
    ),
  );
}

function createProblems({
  catalog,
  table,
  resource,
  declaration,
}: Subject): Array<string> {
  const required = (kind: ModelMember['kind']) =>
    sorted(
      declaration.members
        .filter(
          (member) =>
            member.kind === kind &&
            member.access !== 'read' &&
            requiredOnInsert(catalog, table, member.column),
        )
        .map(({ name }) => name),
    );
  return [
    ...differ(
      'schema.create',
      required('field'),
      requiredKeys(resource.schema.create),
    ),
    ...differ(
      'linkage.create',
      required('relationship'),
      requiredKeys(resource.linkage.create),
    ),
    ...differ('schema.update', [], requiredKeys(resource.schema.update)),
  ];
}

function readProblems({ resource, declaration }: Subject): Array<string> {
  const fields = declaration.members.filter(({ kind }) => kind === 'field');
  return [
    ...differ(
      'schema.read',
      sorted(
        fields
          .filter(({ access }) => access !== 'write')
          .map(({ name }) => name),
      ),
      sorted(Object.keys(resource.schema.read.shape)),
    ),
    ...differ(
      'resource.attributes',
      sorted(fields.map(({ name }) => name)),
      sorted(resource.resource.attributes),
    ),
  ];
}

function byCode(
  a: { readonly code: string },
  b: { readonly code: string },
): number {
  return a.code.localeCompare(b.code);
}

function codeProblems({
  catalog,
  table,
  resource,
  declaration,
  domainCodes,
}: Subject): Array<string> {
  const expected = expectedCodes({
    catalog,
    table,
    members: declaration.members.map(({ column, name, access }) => ({
      column,
      name,
      writable: access !== 'read',
    })),
    scopeColumn: declaration.scopeColumn,
    clientIds: declaration.clientIds,
    ruleCodes: declaration.ruleCodes,
    domainCodes,
  });
  const received = Object.entries(resource.errors).map(
    ([code, { status, kind, fields }]) => ({
      code,
      status,
      kind,
      fields: sorted(fields),
    }),
  );
  return differ(
    'errors',
    expected
      .map(({ code, status, kind, fields }) => ({ code, status, kind, fields }))
      .toSorted(byCode),
    received.toSorted(byCode),
  );
}

function keysetField(
  subject: Subject,
  column: string,
  nullable: boolean,
  extra: { sortable: boolean; operators: ReadonlyArray<string> },
): object {
  const { catalog, table } = subject;
  const type = keysetTypeOf(
    catalog,
    levelOf(catalog, table.columns[column]!),
    columnRules(table, column),
  );
  return { column, ...type, nullable, ...extra };
}

function keysetProblems(subject: Subject): Array<string> {
  const { catalog, table, resource, declaration } = subject;
  const key = table.primaryKey![0]!;
  const listed = declaration.members.filter(
    ({ kind, filter, sort }) => filter !== null || (kind === 'field' && sort),
  );
  const expected = Object.fromEntries([
    ['id', keysetField(subject, key, false, { sortable: true, operators: [] })],
    ...listed.map((member) => [
      member.name,
      keysetField(
        subject,
        member.column,
        !effectivelyNotNull(catalog, table, member.column),
        { sortable: member.sort, operators: member.filter ?? [] },
      ),
    ]),
  ]);
  const received = Object.fromEntries(
    Object.entries(resource.keyset.fields).map(([name, field]) => {
      const { values, collation, ...rest } = field as {
        readonly values?: ReadonlyArray<string>;
        readonly collation?: string;
      };
      const kept =
        collation === undefined || collation === 'default' ? {} : { collation };
      return [
        name,
        {
          ...rest,
          ...(values === undefined ? {} : { values: sorted(values) }),
          ...kept,
        },
      ];
    }),
  );
  return differ('keyset.fields', expected, received);
}

interface ModelOptions {
  readonly options: ReadonlyArray<string> | null;
  readonly items: { readonly options: ReadonlyArray<string> | null } | null;
}

function sortedOrNull(
  values: ReadonlyArray<string> | null,
): ReadonlyArray<string> | null {
  return values === null ? null : sorted(values);
}

/** A member's options, or its elements' (SPEC 3.4, 6.1): the rules of an element are its domains' alone. */
function optionsOf(subject: Subject, member: ModelMember): ModelOptions {
  const [source, column] = valueSource(subject, member);
  const level = levelOf(subject.catalog, source.columns[column]!);
  if (level.element !== null) {
    const element = enumValuesOf(subject.catalog, level.element, []);
    return { options: null, items: { options: sortedOrNull(element) } };
  }
  if (member.kind === 'relationship' && level.base?.type === 'bool') {
    return { options: BOOLEAN_IDS, items: null };
  }
  const values = enumValuesOf(
    subject.catalog,
    level,
    columnRules(source, column),
  );
  return { options: sortedOrNull(values), items: null };
}

function metaProblems(subject: Subject): Array<string> {
  const { catalog, table, resource, declaration } = subject;
  return declaration.members.flatMap((member) => {
    const meta = resource.fields[member.name]!;
    const expected = {
      nullable: !effectivelyNotNull(catalog, table, member.column),
      required:
        member.access !== 'read' &&
        requiredOnInsert(catalog, table, member.column),
      ...(member.codec ? {} : optionsOf(subject, member)),
    };
    const received = {
      nullable: meta.nullable,
      required: meta.required,
      ...(member.codec
        ? {}
        : {
            options: sortedOrNull(meta.options),
            items:
              meta.items === null
                ? null
                : { options: sortedOrNull(meta.items.options) },
          }),
    };
    return differ(`fields.${member.name}`, expected, received);
  });
}

/** Where `resource`, declared over `catalog` as `declaration` states, disagrees with the model. */
export function propertyProblems(
  catalog: PublicCatalog,
  resource: DeclaredResource,
  declaration: ModelDeclaration,
  domainCodes: Subject['domainCodes'],
): PropertyProblems {
  const subject = {
    catalog,
    table: catalog.tables[declaration.table]!,
    resource,
    declaration,
    domainCodes,
  };
  return {
    create: createProblems(subject),
    read: readProblems(subject),
    codes: codeProblems(subject),
    limits: limitsProblems(subject),
    keyset: keysetProblems(subject),
    meta: metaProblems(subject),
  };
}
