/**
 * The query parameters of a list and a get (SPEC 11.1, 13.1), from the
 * JSON:API definition's capabilities, which `parseQuery` holds a request
 * to: `filter[<member>][<operator>]` per declared operator, the search
 * parameter, `sort`, `include`, `fields[<type>]` for the primary type and
 * each includable target, and the page members. `parseQuery` also reads
 * `filter[<member>]` as `eq` and groups conditions under
 * `filter[or][<n>]`, which the filter parameters' description names. A
 * comma separates the values of `sort`, `include`, and `fields`; a list
 * filter repeats its parameter.
 * @ref https://jsonapi.org/format/1.1/#fetching
 * @ref https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md (sections 6.4 to 6.8)
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';
import type { AnyResource } from '@nizam-os/jsonapi-core';
import type { FieldsInit } from '@nizam-os/keyset-core';

import type { DeclaredInternals } from '../declare/declared-resource';

import { relatedResource } from '@nizam-os/jsonapi-core';

import { filterSchema } from './filter-schemas';
import { idSchema } from './resource-schemas';

/** An OpenAPI Parameter Object. */
export interface ParameterObject {
  readonly name: string;
  readonly in: 'query' | 'path';
  readonly required?: boolean;
  readonly description?: string;
  readonly schema: JsonSchema;
  readonly style?: 'form';
  readonly explode?: boolean;
}

const FILTER_GRAMMAR =
  '`filter[<member>]=<value>` is `eq`; `filter[or][<n>][<member>][<operator>]` puts a condition in disjunction group n.';

/** A comma-separated list of `values`. */
function commaList(
  name: string,
  values: ReadonlyArray<string>,
  description: string,
): ParameterObject {
  return {
    name,
    in: 'query',
    description,
    schema: { type: 'array', items: { type: 'string', enum: [...values] } },
    style: 'form',
    explode: false,
  };
}

/** Each operator of each filtered member: the keyset definition's, the ones `parseQuery` takes too (SPEC 11.2). */
function filterParameters(fields: FieldsInit): ReadonlyArray<ParameterObject> {
  return Object.entries(fields).flatMap(([member, field]) =>
    (field.operators ?? []).map((operator) => ({
      name: `filter[${member}][${operator}]`,
      in: 'query' as const,
      description: FILTER_GRAMMAR,
      schema: filterSchema(field, operator),
    })),
  );
}

/** `sort`: each sortable name, `-` for descending; `parseQuery` refuses a field given twice, in either direction. */
function sortParameters(
  definition: AnyResource,
): ReadonlyArray<ParameterObject> {
  const { sort } = definition.query;
  if (sort.length === 0) {
    return [];
  }
  const parameter = commaList(
    'sort',
    sort.flatMap((name) => [name, `-${name}`]),
    'Sort fields, each at most once, `-` for descending.',
  );
  const bothWays = sort.map((name) => ({
    allOf: [{ contains: { const: name } }, { contains: { const: `-${name}` } }],
  }));
  return [
    {
      ...parameter,
      schema: {
        ...parameter.schema,
        uniqueItems: true,
        not: { anyOf: bothWays },
      },
    },
  ];
}

/** The definitions whose fields a response may carry: the primary and each includable target. */
function fieldsets(definition: AnyResource): ReadonlyArray<AnyResource> {
  return [
    definition,
    ...definition.query.include.map((name) =>
      relatedResource(definition, name),
    ),
  ];
}

function fetchParameters(
  definition: AnyResource,
): ReadonlyArray<ParameterObject> {
  const { include } = definition.query;
  return [
    ...(include.length === 0
      ? []
      : [commaList('include', include, 'Related resources to include.')]),
    ...fieldsets(definition).map((target) =>
      commaList(
        `fields[${target.type}]`,
        [...target.fields],
        `The fields of ${target.type} to return.`,
      ),
    ),
  ];
}

function pageParameters(
  definition: AnyResource,
): ReadonlyArray<ParameterObject> {
  const { page } = definition.query;
  if (page === undefined) {
    return [];
  }
  const cursor = { type: 'string', minLength: 1 };
  return [
    {
      name: 'page[size]',
      in: 'query',
      schema: { type: 'integer', minimum: 1, maximum: page.max },
    },
    {
      name: 'page[after]',
      in: 'query',
      description: page.range
        ? 'A cursor; with `page[before]`, a range.'
        : 'A cursor; not with `page[before]`.',
      schema: cursor,
    },
    {
      name: 'page[before]',
      in: 'query',
      description: 'A cursor.',
      schema: cursor,
    },
  ];
}

/** The parameters of a list. */
export function listParameters(
  internals: DeclaredInternals,
): ReadonlyArray<ParameterObject> {
  const definition = internals.resource.resource;
  const { search } = definition.query;
  return [
    ...filterParameters(internals.resource.keyset.fields),
    ...(search === undefined
      ? []
      : [
          {
            name: search.parameter,
            in: 'query' as const,
            description: 'Full-text search.',
            schema: { type: 'string' },
          },
        ]),
    ...sortParameters(definition),
    ...fetchParameters(definition),
    ...pageParameters(definition),
  ];
}

/** The parameters of a get. */
export function getParameters(
  internals: DeclaredInternals,
): ReadonlyArray<ParameterObject> {
  return fetchParameters(internals.resource.resource);
}

/** The resource id in the path. */
export function idParameter(internals: DeclaredInternals): ParameterObject {
  return {
    name: 'id',
    in: 'path',
    required: true,
    schema: idSchema(internals),
  };
}
