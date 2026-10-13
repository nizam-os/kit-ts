/**
 * What a messages object is checked against and filled from (SPEC 10.1,
 * 10.4), read once from the resources and the application's codes
 * `defineMessages` takes: the codes that need texts, the codes that may have them, each
 * derived code's kind and members per type, the constraint kinds, the
 * public members of each type, and the options of each field that has
 * them, an enum's labels or an `enum` rule's values, or its elements'.
 * @packageDocumentation
 */
import type { Catalog } from '@nizam-os/ban-core';

import type { DeclaredResource } from '../declare/declared-resource';
import type { ConstraintKind } from '../errors/error-entry';

import { BUILTIN_CATALOG, resolveDefinition } from '@nizam-os/ban-core';
import { ERROR_CODES } from '@nizam-os/jsonapi-core';

import { QUOTA_EXCEEDED_CODE } from '../errors/quota-exceeded';

/** A derived code: its constraint kind, and the members its items point at in each type that derives it. */
export interface DerivedCode {
  readonly kind: ConstraintKind;
  readonly types: ReadonlyMap<string, ReadonlyArray<string>>;
}

/** The facts of a list of resources a messages object covers. */
export interface MessageIndex {
  /** The codes no resource derives, each needing a title and a detail, in catalog order. */
  readonly codes: ReadonlyArray<string>;
  /** The derived codes and the other built-in codes, whose texts are optional. */
  readonly optional: ReadonlySet<string>;
  readonly derived: ReadonlyMap<string, DerivedCode>;
  /** The catalog key of each application code whose rendered `code` differs from its key. */
  readonly keys: ReadonlyMap<string, string>;
  /** The constraint kinds of the derived codes, in the order of SPEC 9.1. */
  readonly kinds: ReadonlyArray<ConstraintKind>;
  /** Each type's public fields and relationships, in `fields` order. */
  readonly members: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Each type's fields with options, and their values in order. */
  readonly options: ReadonlyMap<
    string,
    ReadonlyMap<string, ReadonlyArray<string>>
  >;
}

const KIND_ORDER: ReadonlyArray<ConstraintKind> = [
  'check',
  'notNull',
  'unique',
  'primaryKey',
  'exclusion',
  'foreignKey',
];

function derivedCodes(
  resources: ReadonlyArray<DeclaredResource>,
): ReadonlyMap<string, DerivedCode> {
  const derived = new Map<
    string,
    { kind: ConstraintKind; types: Map<string, ReadonlyArray<string>> }
  >();
  for (const resource of resources) {
    for (const [code, entry] of Object.entries(resource.errors)) {
      const known = derived.get(code) ?? { kind: entry.kind, types: new Map() };
      known.types.set(resource.names.type, entry.fields);
      derived.set(code, known);
    }
  }
  return derived;
}

function optionsOf(
  resource: DeclaredResource,
): ReadonlyMap<string, ReadonlyArray<string>> {
  return new Map(
    Object.values(resource.fields).flatMap((meta) => {
      const options = meta.options ?? meta.items?.options ?? null;
      return meta.kind === 'attribute' && options !== null
        ? [[meta.name, options] as const]
        : [];
    }),
  );
}

/** The index of `resources` and the application's codes. */
export function messageIndex(
  resources: ReadonlyArray<DeclaredResource>,
  appErrors: Catalog,
): MessageIndex {
  const codes = [
    ...ERROR_CODES,
    QUOTA_EXCEEDED_CODE,
    ...Object.keys(appErrors),
  ];
  const derived = derivedCodes(resources);
  const required = new Set(codes);
  const optional = new Set(
    [...derived.keys(), ...Object.keys(BUILTIN_CATALOG)].filter(
      (code) => !required.has(code),
    ),
  );
  const kinds = new Set([...derived.values()].map(({ kind }) => kind));
  return {
    codes,
    optional,
    derived,
    keys: new Map(
      Object.entries(appErrors).flatMap(([key, definition]) => {
        const { code } = resolveDefinition(key, definition);
        return code === key ? [] : [[code, key] as const];
      }),
    ),
    kinds: KIND_ORDER.filter((kind) => kinds.has(kind)),
    members: new Map(
      resources.map((resource) => [
        resource.names.type,
        Object.keys(resource.fields),
      ]),
    ),
    options: new Map(
      resources
        .map((resource) => [resource.names.type, optionsOf(resource)] as const)
        .filter(([, options]) => options.size > 0),
    ),
  };
}
