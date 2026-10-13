/**
 * What the adapter checks give each adapter's hooks (SPEC 16.5, 17.4): the
 * options `resourceQueries` and `operationsMutation` of the built
 * `@nizam-os/tanstack-query-jsonapi` make over clients of the blog's
 * definitions and their transport, the queries the checks pass, and, as
 * the oracle, what the client's own calls resolve to for the same queries
 * and operations. Read by the type check only: nothing here runs.
 */
import type { CreateInput, Operation } from '@nizam-os/jsonapi-client';
import type { UpdateVariables } from '@nizam-os/tanstack-query-jsonapi';

import {
  createClients,
  createTransport,
  operationsOf,
  sendOperations,
} from '@nizam-os/jsonapi-client';
import {
  operationsMutation,
  resourceQueries,
} from '@nizam-os/tanstack-query-jsonapi';

import { Articles, People, Tags } from '../../support/resources.ts';

const transport = createTransport({ origin: 'https://blog.example' });
const clients = createClients(
  { articles: Articles, people: People, tags: Tags },
  transport,
);
const articleOperations = operationsOf(Articles);

export const articles = resourceQueries(clients.articles);
export const people = resourceQueries(clients.people);

/** An article's update as an operation. */
type Retitle = ReturnType<typeof articleOperations.update>;

/** Any operations in one request, people's lists invalidated with the types written. */
export const operations = operationsMutation(transport, {
  invalidates: [people.all],
});
/** Article updates in one request, their results typed by the definition. */
export const retitling = operationsMutation<Retitle>(transport);

/** A list's query: the author of each article included. */
export const LISTED = { include: ['author'] } as const;
/** A record's query: the title alone. */
export const SPARSE = { fields: { articles: ['title'] } } as const;
/** An infinite list's query: newest first, three a page. */
export const NEWEST = { sort: ['-createdAt'], page: { size: 3 } } as const;

async function listed() {
  return clients.articles.list(LISTED);
}

async function sparse() {
  return clients.articles.get('1', SPARSE);
}

async function newest() {
  return clients.articles.list(NEWEST);
}

async function created() {
  return clients.articles.create({ attributes: { title: 'Adapters' } });
}

async function retitled(retitles: ReadonlyArray<Retitle>) {
  return sendOperations(transport, retitles);
}

/** What `clients.articles.list(LISTED)` resolves to. */
export type Listed = Awaited<ReturnType<typeof listed>>;
/** What `clients.articles.get('1', SPARSE)` resolves to. */
export type Sparse = Awaited<ReturnType<typeof sparse>>;
/** A page of `clients.articles.list(NEWEST)`. */
export type Page = Awaited<ReturnType<typeof newest>>;
/** What `clients.articles.create(input)` resolves to. */
export type Created = Awaited<ReturnType<typeof created>>;
/** What `sendOperations` resolves to for article updates. */
export type Retitled = Awaited<ReturnType<typeof retitled>>;
/** What a mutation of any operations takes. */
export type Operations = ReadonlyArray<Operation>;
/** What a create of an article takes. */
export type ArticleInput = CreateInput<typeof Articles>;
/** What an update of an article takes. */
export type ArticleUpdate = UpdateVariables<typeof Articles>;
