/**
 * The round trip (SPEC 15.5): every query generated from the blog's
 * definitions, serialized and parsed back by `parseQuery`, is the query
 * the client meant: the same include paths, fieldsets, sort, page,
 * conditions and groups in order, each condition at the parameter the
 * client wrote it as, search, and custom parameters.
 */
import type { AnyResource, ParsedQuery } from '@nizam-os/jsonapi-core';

import type { FilterValues, Query } from './types';

import { describe, expect, it } from 'vitest';

import { parseQuery } from '@nizam-os/jsonapi-core';

import { Articles, People, Tags } from '../test-support/blog';
import { serializeQuery } from './serialize-query';

type Expected = Omit<ParsedQuery, 'params'>;

/** Every combination of one option per member. */
function combinations(
  options: Readonly<Record<string, ReadonlyArray<unknown>>>,
): Array<Record<string, unknown>> {
  return Object.entries(options).reduce<Array<Record<string, unknown>>>(
    (queries, [member, values]) =>
      queries.flatMap((query) =>
        values.map((value) =>
          value === undefined ? query : { ...query, [member]: value },
        ),
      ),
    [{}],
  );
}

/** What `parseQuery` gives for one parameter's values: a repeated one is an array. */
function parsed(values: FilterValues): string | ReadonlyArray<string> {
  const list = (Array.isArray(values) ? values : [values]).map(String);
  return list.length === 1 ? list[0]! : list;
}

/** The members whose value is defined: `serializeQuery` leaves the rest out. */
function defined<TValue>(
  record: Readonly<Record<string, TValue | undefined>> = {},
): Record<string, TValue> {
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, TValue] => entry[1] !== undefined,
    ),
  );
}

/** The conditions `parseQuery` reads under `prefix`, each with the parameter the client wrote it as. */
function conditionsOf(
  conditions: Readonly<Record<string, unknown>>,
  prefix: string,
) {
  return Object.entries(conditions).flatMap(([field, condition]) => {
    if (field === 'or') {
      return [];
    }
    if (
      typeof condition === 'object' &&
      condition !== null &&
      !Array.isArray(condition)
    ) {
      return Object.entries(condition).map(([operator, values]) => ({
        field,
        operator,
        value: parsed(values as FilterValues),
        parameter: `${prefix}[${field}][${operator}]`,
      }));
    }
    return [
      {
        field,
        operator: 'eq',
        value: parsed(condition as FilterValues),
        parameter: `${prefix}[${field}]`,
      },
    ];
  });
}

function expected(definition: AnyResource, query: Query): Expected {
  const filter = (query.filter ?? {}) as Readonly<Record<string, unknown>>;
  const groups = (filter['or'] ?? []) as ReadonlyArray<
    Readonly<Record<string, unknown>>
  >;
  const page = definition.query.page;
  return {
    include: query.include?.map((path) => path.split('.')),
    fields: defined(query.fields),
    sort: (query.sort ?? []).map((name) =>
      name.startsWith('-')
        ? { field: name.slice(1), direction: 'desc' }
        : { field: name, direction: 'asc' },
    ),
    filter: {
      conditions: conditionsOf(filter, 'filter'),
      anyOf: groups.map((group, index) =>
        conditionsOf(group, `filter[or][${String(index)}]`),
      ),
    },
    page:
      page === undefined
        ? undefined
        : {
            size: query.page?.size ?? page.default,
            after: query.page?.after,
            before: query.page?.before,
            sizeRequested: query.page?.size !== undefined,
            range: false,
          },
    search: query.search,
    custom: Object.fromEntries(
      Object.entries(defined(query.custom)).map(([name, values]) => [
        name,
        parsed(values),
      ]),
    ),
  };
}

function roundTrip(definition: AnyResource, query: Query): void {
  const url = `https://blog.example/api/x?${serializeQuery(definition, query).toString()}`;
  const { params: _params, ...back } = parseQuery(
    definition,
    new URL(url).search,
  );
  expect(back).toEqual(expected(definition, query));
}

const ARTICLE_QUERIES = combinations({
  include: [undefined, [], ['author'], ['author', 'tags'], ['author.articles']],
  fields: [
    undefined,
    { articles: ['title', 'author'] },
    { articles: [], people: ['name', 'twitter'] },
  ],
  sort: [undefined, ['title'], ['-createdAt', 'title'], ['-author.name']],
  page: [
    undefined,
    { size: 3 },
    { after: 'c,1 x+%' },
    { before: 'b[0]', size: 1 },
  ],
  filter: [
    undefined,
    { title: 'a,b c' },
    {
      title: { like: 'J%' },
      createdAt: { gte: '2026-01-01', lt: '2027-01-01' },
    },
    { author: { in: ['1', '2', '3,4'] } },
    { author: { isNull: true }, title: ['x', 'y'] },
    {
      or: [{ title: 'x' }, { author: '1', title: { like: 'é%' } }],
      createdAt: { gte: 5 },
    },
  ],
  search: [undefined, 'graph ql & more'],
  custom: [
    undefined,
    { highlightMode: 'on' },
    { 'highlightMode[fields]': ['title', 'body'] },
  ],
});

describe('the round trip through parseQuery (SPEC 15.5)', () => {
  it(`reads back each of ${String(ARTICLE_QUERIES.length)} article queries as sent`, () => {
    for (const query of ARTICLE_QUERIES) {
      roundTrip(Articles, query);
    }
  });

  it("reads back a search in a custom parameter, and a definition's without page or search", () => {
    const people = combinations({
      include: [undefined, ['articles.tags']],
      filter: [undefined, { twitter: { isNull: false }, name: { like: 'A%' } }],
      search: [undefined, 'ada lovelace'],
      page: [undefined, { size: 50 }],
    });
    for (const query of people) {
      roundTrip(People, query);
    }
    const tags = combinations({
      sort: [undefined, ['-name']],
      filter: [
        undefined,
        { name: { in: ['a', 'b'] } },
        { or: [{ name: 'a' }, { name: 'b' }] },
      ],
    });
    for (const query of tags) {
      roundTrip(Tags, query);
    }
  });
});
