import type { DeclaredResource } from '../declare/declared-resource';
import type { ParameterObject } from './parameters';

import { describe, expect, it } from 'vitest';

import { parseQuery } from '@nizam-os/jsonapi-core';
import { OPERATORS } from '@nizam-os/keyset-core';

import { internalsOf } from '../declare/declared-resource';
import { Contacts, Organizations } from '../test-support/definition-resources';
import { compileSchema } from '../test-support/openapi-ajv';
import { getParameters, idParameter, listParameters } from './parameters';

/**
 * The documented parameters against the parser a route runs, `parseQuery`
 * of `@nizam-os/jsonapi-core`: every name and value the document offers is
 * accepted, and every filter, sort, include, and fieldset name it leaves
 * out is refused. Filter values are keyset-core's to interpret, which
 * `filter-schemas.test.ts` holds the schemas to.
 */

function internals(resource: DeclaredResource) {
  const found = internalsOf(resource);
  if (found === undefined) {
    throw new Error('not a declared resource');
  }
  return found;
}

function accepts(
  resource: DeclaredResource,
  pairs: ReadonlyArray<readonly [string, string]>,
): boolean {
  try {
    const query = new URLSearchParams();
    for (const [name, value] of pairs) {
      query.append(name, value);
    }
    parseQuery(resource.resource, query.toString());
    return true;
  } catch {
    return false;
  }
}

function named(
  parameters: ReadonlyArray<ParameterObject>,
  name: string,
): ParameterObject {
  const parameter = parameters.find((candidate) => candidate.name === name);
  if (parameter === undefined) {
    throw new Error(`no parameter ${name}`);
  }
  return parameter;
}

function enumOf(parameter: ParameterObject): ReadonlyArray<string> {
  const items = parameter.schema['items'] as { enum: ReadonlyArray<string> };
  return items.enum;
}

/**
 * Every list of `values` with at most two items, repetitions included. A
 * form-style list without explode sends its items joined by `,`, the
 * empty list as an empty value (OpenAPI 4.8.12.4).
 * @ref https://spec.openapis.org/oas/v3.1.2.html#style-examples
 */
function sequences(
  values: ReadonlyArray<string>,
): ReadonlyArray<ReadonlyArray<string>> {
  return [
    [],
    ...values.map((first) => [first]),
    ...values.flatMap((first) => values.map((second) => [first, second])),
  ];
}

/** A value the parameter's schema admits; the parser does not read filter values. */
function sample(parameter: ParameterObject): ReadonlyArray<string> {
  const { schema } = parameter;
  if (schema['type'] === 'array') {
    return ['1', '2'];
  }
  return Array.isArray(schema['enum']) ? [String(schema['enum'][0])] : ['1'];
}

describe('listParameters', () => {
  const contacts = listParameters(internals(Contacts));
  const names = new Set(contacts.map((parameter) => parameter.name));

  it('offers only names and values the parser accepts', () => {
    for (const parameter of contacts.filter((each) => each.style !== 'form')) {
      const pairs = sample(parameter).map(
        (value) => [parameter.name, value] as const,
      );
      expect(accepts(Contacts, pairs), parameter.name).toBe(true);
    }
  });

  it('describes each comma list exactly as the parser reads it', () => {
    for (const parameter of contacts.filter((each) => each.style === 'form')) {
      const validate = compileSchema(parameter.schema);
      for (const sequence of sequences([...enumOf(parameter), 'fax'])) {
        const value = sequence.join(',');
        expect(
          accepts(Contacts, [[parameter.name, value]]),
          `${parameter.name}=${value}`,
        ).toBe(validate(sequence));
      }
    }
  });

  it('names every filter the parser takes, and no other', () => {
    const members = [
      ...internals(Contacts).resource.resource.fields,
      'search',
      'id',
    ];
    for (const member of members) {
      for (const operator of OPERATORS) {
        const name = `filter[${member}][${operator}]`;
        const values =
          operator === 'between' || operator === 'in' || operator === 'nin'
            ? ['1', '2']
            : [operator === 'isNull' ? 'true' : '1'];
        expect(
          accepts(
            Contacts,
            values.map((value) => [name, value] as const),
          ),
          name,
        ).toBe(names.has(name));
      }
    }
  });

  it('offers each sortable name both ways, each once, and the parser refuses every other field', () => {
    const sort = named(contacts, 'sort');
    expect(sort.schema['uniqueItems']).toBe(true);
    const offered = enumOf(sort);
    for (const field of internals(Contacts).resource.resource.fields) {
      for (const value of [field, `-${field}`]) {
        expect(accepts(Contacts, [['sort', value]]), value).toBe(
          offered.includes(value),
        );
      }
    }
    expect(offered).toEqual(
      expect.arrayContaining(['createdAt', '-createdAt']),
    );
  });

  it('offers the includes and fieldsets the parser takes, and nothing for an unknown type', () => {
    expect(enumOf(named(contacts, 'include'))).toEqual(['organization']);
    expect(accepts(Contacts, [['include', 'notes']])).toBe(false);
    for (const type of ['contacts', 'organizations']) {
      const fields = enumOf(named(contacts, `fields[${type}]`));
      expect(accepts(Contacts, [[`fields[${type}]`, fields.join(',')]])).toBe(
        true,
      );
      expect(accepts(Contacts, [[`fields[${type}]`, 'fax']]), type).toBe(false);
    }
    expect(names.has('fields[people]')).toBe(false);
  });

  it('bounds the page as the parser does', () => {
    const size = named(contacts, 'page[size]').schema;
    expect(size).toEqual({ type: 'integer', minimum: 1, maximum: 50 });
    expect(accepts(Contacts, [['page[size]', '50']])).toBe(true);
    expect(accepts(Contacts, [['page[size]', '51']])).toBe(false);
    expect(accepts(Contacts, [['page[size]', '0']])).toBe(false);
    expect(accepts(Contacts, [['page[after]', '']])).toBe(false);
    expect(
      accepts(Contacts, [
        ['page[after]', 'a'],
        ['page[before]', 'b'],
      ]),
    ).toBe(false);
  });

  it('offers no sort, include, or search a resource does not declare', () => {
    const organizations = listParameters(internals(Organizations));
    expect(organizations.map((parameter) => parameter.name)).toEqual([
      'sort',
      'fields[organizations]',
      'page[size]',
      'page[after]',
      'page[before]',
    ]);
    expect(accepts(Organizations, [['include', 'contacts']])).toBe(false);
    expect(accepts(Organizations, [['filter[q]', 'x']])).toBe(false);
  });
});

describe('getParameters and idParameter', () => {
  it('offer the includes and fieldsets of one resource, and its id in the path', () => {
    expect(
      getParameters(internals(Contacts)).map((parameter) => parameter.name),
    ).toEqual(['include', 'fields[contacts]', 'fields[organizations]']);
    expect(idParameter(internals(Contacts))).toMatchObject({
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });
  });
});
