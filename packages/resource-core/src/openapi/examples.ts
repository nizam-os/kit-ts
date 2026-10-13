/**
 * Business examples (SPEC 13.1): `options.examples` names, per type, the
 * resource objects of a create's and an update's request and of a get's
 * response. Each MUST pass what the server holds that body to: the id's
 * schema where it carries one (SPEC 3.4), `write.create` or
 * `write.update` (SPEC 6.2), and for a response `schema.read` and
 * `linkage.read`, every member present and none unknown. `openapi` throws
 * `TypeError` naming the first example that fails with the issue's path
 * and message, never a value, so an invalid example fails the build
 * instead of shipping in the document, and refuses examples of a type it
 * does not list or of a body its resource does not have, which would
 * otherwise be dropped unseen. A get's example is the document
 * `@nizam-os/jsonapi-core` builds for the row it stands for, links
 * included, so it shows what the server sends. A field's declared example
 * is the `examples` of its property (SPEC 8), checked when it was declared.
 * @ref https://spec.openapis.org/oas/v3.1.2.html#example-object
 * @packageDocumentation
 */
import type { z } from 'zod/v4';

import type { DeclaredInternals } from '../declare/declared-resource';
import type { Operation } from '../declare/types';
import type { PublicRow } from '../server/storage';
import type { ExampleBody } from './operation-object';

import { safeParse } from 'zod/v4/core';

import { resourceDocument } from '@nizam-os/jsonapi-core';

import { isRecord } from '../internal/object';
import { idSchema } from '../schema/id-schema';

/** A resource object an example gives: its relationships as their linkage, `{ type, id }` or `null`. */
export interface ResourceExample {
  readonly summary?: string | undefined;
  readonly description?: string | undefined;
  readonly id?: string | undefined;
  readonly attributes?: Readonly<Record<string, unknown>> | undefined;
  readonly relationships?: Readonly<Record<string, unknown>> | undefined;
}

/** By type, body, and name. */
export type ResourceExamples = Readonly<
  Record<
    string,
    Partial<Record<ExampleBody, Readonly<Record<string, ResourceExample>>>>
  >
>;

/** An OpenAPI Example Object. */
export interface ExampleObject {
  readonly summary?: string;
  readonly description?: string;
  readonly value: unknown;
}

/** The first problem of an example, as a path and an English message, or `undefined`. */
type Problem = string | undefined;

function zodProblem(
  schema: z.ZodType,
  value: unknown,
  prefix: string,
): Problem {
  const result = safeParse(schema, value);
  const [issue] = result.success ? [] : result.error.issues;
  return issue === undefined
    ? undefined
    : `${[prefix, ...issue.path.map(String)].join('.')}: ${issue.message}`;
}

function idProblem(
  internals: DeclaredInternals,
  example: ResourceExample,
  body: ExampleBody,
): Problem {
  const takesId = body !== 'create' || internals.resource.resource.clientIds;
  if (example.id === undefined) {
    return takesId && body !== 'create'
      ? 'id: a resource object of this body carries an id'
      : undefined;
  }
  if (!takesId) {
    return 'id: the resource takes no client id';
  }
  return zodProblem(idSchema(internals.specs.id.value, 'id'), example.id, 'id');
}

function unknownKeys(
  schema: z.ZodObject,
  value: Readonly<Record<string, unknown>>,
  part: string,
): Problem {
  const unknown = Object.keys(value).find(
    (key) => !Object.hasOwn(schema.shape, key),
  );
  return unknown === undefined
    ? undefined
    : `${part}.${unknown}: not a member of the response`;
}

function writeProblem(
  internals: DeclaredInternals,
  example: ResourceExample,
  body: 'create' | 'update',
): Problem {
  const result = internals.resource.write[body]['~standard'].validate({
    attributes: example.attributes ?? {},
    relationships: example.relationships ?? {},
  });
  const [issue] = result.issues ?? [];
  return issue === undefined
    ? undefined
    : `${issue.path.join('.')}: ${issue.message}`;
}

function readProblem(
  internals: DeclaredInternals,
  example: ResourceExample,
): Problem {
  const { schema, linkage } = internals.resource;
  const attributes = example.attributes ?? {};
  const relationships = example.relationships ?? {};
  return (
    unknownKeys(schema.read, attributes, 'attributes') ??
    unknownKeys(linkage.read, relationships, 'relationships') ??
    zodProblem(schema.read, attributes, 'attributes') ??
    zodProblem(linkage.read, relationships, 'relationships')
  );
}

function problemOf(
  internals: DeclaredInternals,
  example: ResourceExample,
  body: ExampleBody,
): Problem {
  return (
    idProblem(internals, example, body) ??
    (body === 'get'
      ? readProblem(internals, example)
      : writeProblem(internals, example, body))
  );
}

/** The operation whose body each example is. */
const BODY_OPERATION: Readonly<Record<ExampleBody, Operation>> = {
  create: 'create',
  update: 'update',
  get: 'get',
};

function isExampleBody(body: string): body is ExampleBody {
  return Object.hasOwn(BODY_OPERATION, body);
}

/**
 * Throws `TypeError` for examples of a type that is not one of `listed`, or
 * of a body its resource has no operation for.
 */
export function checkExamples(
  listed: ReadonlyArray<DeclaredInternals>,
  examples: ResourceExamples | undefined,
): void {
  for (const [type, bodies] of Object.entries(examples ?? {})) {
    const internals = listed.find(
      (candidate) => candidate.resource.names.type === type,
    );
    if (internals === undefined) {
      throw new TypeError(
        `openapi: examples.${type}: not the type of a listed resource`,
      );
    }
    const operations = new Set(internals.resource.declaration.operations);
    const body = Object.keys(bodies).find(
      (name) => !isExampleBody(name) || !operations.has(BODY_OPERATION[name]),
    );
    if (body !== undefined) {
      throw new TypeError(
        `openapi: examples.${type}.${body}: the resource has no such body; it takes create, update, and get for its declared operations`,
      );
    }
  }
}

/** The public row a get's example stands for: its attributes and each relationship's target id, as `serialize` reads them. */
function exampleRow(id: string, example: ResourceExample): PublicRow {
  const relationships = Object.entries(example.relationships ?? {}).map(
    ([name, data]) =>
      [
        name,
        isRecord(data) && typeof data['id'] === 'string' ? data['id'] : null,
      ] as const,
  );
  return {
    ...example.attributes,
    ...Object.fromEntries(relationships),
    id,
  };
}

/** The document an example's resource object travels in: a get's as the server builds it, a request's with each relationship's linkage in `data`. */
function exampleDocument(
  internals: DeclaredInternals,
  body: ExampleBody,
  example: ResourceExample,
): unknown {
  const { resource, names } = internals.resource;
  if (body === 'get' && example.id !== undefined) {
    return resourceDocument(resource, exampleRow(example.id, example));
  }
  return requestDocument(names.type, example);
}

function requestDocument(type: string, example: ResourceExample): unknown {
  const { id, attributes, relationships } = example;
  return {
    data: {
      type,
      ...(id === undefined ? {} : { id }),
      ...(attributes === undefined ? {} : { attributes }),
      ...(relationships === undefined
        ? {}
        : {
            relationships: Object.fromEntries(
              Object.entries(relationships).map(([name, data]) => [
                name,
                { data },
              ]),
            ),
          }),
    },
  };
}

/**
 * The Example Objects of `body` for the resource, or `undefined` when none
 * are given; throws `TypeError` for the first example its schema refuses.
 */
export function exampleObjects(
  internals: DeclaredInternals,
  body: ExampleBody,
  examples: ResourceExamples | undefined,
): Readonly<Record<string, ExampleObject>> | undefined {
  const { type } = internals.resource.names;
  const given = examples?.[type]?.[body];
  if (given === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(given).map(([name, example]) => {
      const problem = problemOf(internals, example, body);
      if (problem !== undefined) {
        throw new TypeError(
          `openapi: examples.${type}.${body}.${name}: ${problem}`,
        );
      }
      const { summary, description } = example;
      return [
        name,
        {
          ...(summary === undefined ? {} : { summary }),
          ...(description === undefined ? {} : { description }),
          value: exampleDocument(internals, body, example),
        },
      ];
    }),
  );
}
