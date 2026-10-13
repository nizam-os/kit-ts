/**
 * A generated application (SPEC 15.2): a seeded catalog, the definer's
 * `domains` with a validator for each domain CHECK without a rule, and per
 * table the declaration of `choices.ts`; some codes are given, in the
 * declarations' `rules` and in the definer's `domains`, the others derived.
 * `declareApplication` declares it through the untyped definer, as a
 * JavaScript caller would, since a generated catalog has no literal type.
 * Not published with the package.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { DeclaredResource } from '../../declare/declared-resource';
import type { ModelDeclaration } from '../model/members';
import type { RuleEntry, TableChoices } from './choices';

import { z } from 'zod';

import { CATALOG_FORMAT } from '@nizam-os/catalog-core';

import { defineValidator } from '../../codecs/define-validator';
import { untypedDeclare } from '../catalog-builder';
import { expectedCodes } from '../model/codes';
import { chooseTable } from './choices';
import { generateDomains } from './domains';
import { createRandom, type Random } from './random';
import { generateTables, SCOPE_COLUMN } from './tables';

/** A catalog and the declarations over it. */
export interface GeneratedApplication {
  readonly seed: number;
  readonly catalog: PublicCatalog;
  readonly domains: Readonly<
    Record<string, Readonly<Record<string, RuleEntry>>>
  >;
  readonly tables: ReadonlyArray<TableChoices>;
}

const ENUMS: Readonly<Record<string, ReadonlyArray<string>>> = {
  mood: ['calm', 'tense', 'happy'],
  level: ['low', 'high'],
};

const REFUSED = '\u0001refused';

/** The one validator: it accepts anything but a value no generated fixture holds. */
const VALIDATORS = {
  anything: defineValidator({
    schema: z.unknown().refine((value) => value !== REFUSED),
    fixtures: { accept: ['x', null], reject: [REFUSED] },
  }),
};

function generateEnums(random: Random): Record<string, ReadonlyArray<string>> {
  const enums = Object.fromEntries(
    Object.entries(ENUMS).filter(() => random.chance(0.7)),
  );
  return random.chance(0.15) ? { ...enums, empty_kind: [] } : enums;
}

/** Hands out codes no derived code takes. */
function codeSource(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `GIVEN_${String(next)}`;
  };
}

function domainEntries(
  random: Random,
  catalog: PublicCatalog,
  give: () => string,
): Record<string, Record<string, RuleEntry>> {
  const entries: Record<string, Record<string, RuleEntry>> = {};
  for (const domain of Object.values(catalog.domains)) {
    for (const [name, { rule }] of Object.entries(domain.constraints)) {
      const code = random.chance(0.3) ? { code: give() } : {};
      if (rule === null || 'code' in code) {
        (entries[domain.name] ??= {})[name] =
          rule === null ? { validator: 'anything', ...code } : code;
      }
    }
  }
  return entries;
}

function domainCodes(
  domains: GeneratedApplication['domains'],
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(domains).map(([domain, entries]) => [
      domain,
      Object.fromEntries(
        Object.entries(entries).flatMap(([name, { code }]) =>
          code === undefined ? [] : [[name, code]],
        ),
      ),
    ]),
  );
}

/** Gives some of a table's own keys a code, next to its validators. */
function withGivenCodes(
  random: Random,
  catalog: PublicCatalog,
  choices: TableChoices,
  given: GeneratedApplication['domains'],
  give: () => string,
): TableChoices {
  const codes = expectedCodes({
    catalog,
    table: catalog.tables[choices.table]!,
    members: choices.members.map(({ column, name, access }) => ({
      column,
      name,
      writable: access !== 'read',
    })),
    scopeColumn: choices.scoped ? SCOPE_COLUMN : null,
    clientIds: choices.clientIds,
    ruleCodes: {},
    domainCodes: domainCodes(given),
  });
  const rules: Record<string, RuleEntry> = { ...choices.rules };
  for (const { key } of codes) {
    if (!key.includes('.') && random.chance(0.2)) {
      rules[key] = { ...rules[key], code: give() };
    }
  }
  return { ...choices, rules };
}

/** The application seed `seed` generates. */
export function generateApplication(seed: number): GeneratedApplication {
  const random = createRandom(seed);
  const enums = generateEnums(random);
  const domains = generateDomains(random, enums);
  const tables = generateTables(random, { enums, domains });
  const catalog: PublicCatalog = {
    format: CATALOG_FORMAT,
    enums,
    domains,
    tables,
  };
  const give = codeSource();
  const entries = domainEntries(random, catalog, give);
  return {
    seed,
    catalog,
    domains: entries,
    tables: Object.values(tables).map((table) =>
      withGivenCodes(
        random,
        catalog,
        chooseTable(random, catalog, table),
        entries,
        give,
      ),
    ),
  };
}

/** The codes a table's declaration gives, by rule key. */
function ruleCodesOf(choices: TableChoices): Record<string, string> {
  return Object.fromEntries(
    Object.entries(choices.rules).flatMap(([key, { code }]) =>
      code === undefined ? [] : [[key, code]],
    ),
  );
}

/** A table's declaration as the model reads it. */
export function modelDeclarationOf(choices: TableChoices): ModelDeclaration {
  return {
    table: choices.table,
    members: choices.members,
    scopeColumn: choices.scoped ? SCOPE_COLUMN : null,
    clientIds: choices.clientIds,
    ruleCodes: ruleCodesOf(choices),
  };
}

/** The domain codes the definer gives, by domain and constraint. */
export function domainCodesOf(
  app: GeneratedApplication,
): Record<string, Record<string, string>> {
  return domainCodes(app.domains);
}

/** A member's `filter`, when it has one. */
function optional(filter: ReadonlyArray<string> | null): object {
  return filter === null ? {} : { filter };
}

function declaration(
  choices: TableChoices,
  resources: ReadonlyMap<string, DeclaredResource>,
): object {
  const fields = choices.members.filter(({ kind }) => kind === 'field');
  const relationships = choices.members.filter(
    ({ kind }) => kind === 'relationship',
  );
  return {
    operations: choices.operations,
    ...(choices.scoped ? { scope: 'organization' } : {}),
    ...(choices.clientIds ? { clientIds: true } : {}),
    fields: Object.fromEntries(
      fields.map(({ column, access, filter, sort }) => [
        column,
        { access, ...optional(filter), ...(sort ? { sort } : {}) },
      ]),
    ),
    relationships: Object.fromEntries(
      relationships.map(({ column, access, filter, target }) => [
        column,
        { target: () => resources.get(target!), access, ...optional(filter) },
      ]),
    ),
    rules: choices.rules,
  };
}

/** Declares every table of `app`, by table name. */
export function declareApplication(
  app: GeneratedApplication,
): Map<string, DeclaredResource> {
  const declare = untypedDeclare(app.catalog, {
    validators: VALIDATORS,
    scopes: { organization: { column: SCOPE_COLUMN } },
    domains: app.domains,
  });
  const resources = new Map<string, DeclaredResource>();
  for (const choices of app.tables) {
    resources.set(
      choices.table,
      declare(choices.table, declaration(choices, resources)),
    );
  }
  return resources;
}
