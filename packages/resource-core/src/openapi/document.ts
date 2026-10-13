/**
 * `openapi(resources, options)` (SPEC 13.1): the OpenAPI 3.1 document of a
 * registry. It runs the registry checks (SPEC 4.2), builds the error
 * responses with the instance `@nizam-os/hono-jsonapi`'s `errorHandler`
 * renders with, the JSON:API catalog, every listed resource's codes, and
 * the application's, under the JSON:API format with combined entries
 * (jsonapi SPEC 10.5), and refuses a code the options name that this
 * catalog lacks. Each code's error object is in `components.schemas` once,
 * and every response references it; a status that carries one code is a
 * reference to that code's response, in `components.responses` once (ban
 * SPEC 9). Paths come from each definition's links (`paths.ts`); an
 * absolute link's origin becomes the document's server, so every resource
 * must share it.
 * @ref https://spec.openapis.org/oas/v3.1.2.html
 * @ref https://jsonapi.org/format/1.1/#content-negotiation
 * @packageDocumentation
 */
import type { Catalog, JsonSchema } from '@nizam-os/ban-core';
import type { JsonApiOptions } from '@nizam-os/ban-core/formats/json-api';
import type { ResponseObject } from '@nizam-os/ban-core/openapi';

import type {
  AnyDeclaredResource,
  DeclaredInternals,
} from '../declare/declared-resource';
import type { ResourceExamples } from './examples';
import type { DocumentOperation, OperationCodes } from './operation-codes';
import type { OperationContext, PathItem } from './operation-object';

import { createBan } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';
import {
  errorObjectSchemas,
  errorResponseObjects,
  errorResponses,
} from '@nizam-os/ban-core/openapi';
import { ERROR_CATALOG, resourcePaths } from '@nizam-os/jsonapi-core';

import { errorCatalog } from '../errors/error-catalog';
import { checkRegistry } from '../registry/check-registry';
import {
  atomicOperation,
  atomicSchemas,
  lidTypes,
  operationsPath,
  servesOperations,
} from './atomic-operations';
import {
  errorKey,
  errorRef,
  errorResponseRef,
  schemaKey,
} from './component-names';
import { checkExamples, exampleObjects } from './examples';
import { atomicCodes, operationCodes } from './operation-codes';
import { pathItems } from './operations';
import {
  identifierSchema,
  requestObjectSchema,
  resourceObjectSchema,
} from './resource-schemas';

/** The OpenAPI version the document declares: the latest 3.1 release. */
const OPENAPI_VERSION = '3.1.2';

/** The document's `info`: a title and the API's version at least. */
export interface InfoObject {
  readonly title: string;
  readonly version: string;
  readonly summary?: string | undefined;
  readonly description?: string | undefined;
}

export interface OpenApiOptions {
  readonly info: InfoObject;
  /** The application's own codes, as `errorCatalog` takes them (SPEC 9.2). */
  readonly appErrors?: Catalog | undefined;
  /** The codes of the application's rules, quotas, and middleware, which the declarations cannot know. */
  readonly codes?: OperationCodes | undefined;
  /** The error handler's options that shape its documents: the instance's `docsBaseUrl` and the JSON:API format's own (jsonapi SPEC 10.5). */
  readonly errors?:
    | {
        readonly docsBaseUrl?: string | undefined;
        readonly format?: Omit<JsonApiOptions, 'mixedEntries'> | undefined;
      }
    | undefined;
  /** Business examples by type and body; each must pass its schema. */
  readonly examples?: ResourceExamples | undefined;
}

/** An OpenAPI 3.1 document. */
export interface OpenApiDocument {
  readonly openapi: string;
  readonly info: InfoObject;
  readonly servers?: ReadonlyArray<{ readonly url: string }>;
  readonly paths: Readonly<Record<string, PathItem>>;
  readonly components: {
    readonly schemas: Readonly<Record<string, JsonSchema>>;
    readonly responses: Readonly<Record<string, ResponseObject>>;
  };
}

/** The resource's component schemas, with the ones its operations read when the document lists the operations endpoint, whose lid types `lids` holds. */
function componentSchemas(
  internals: DeclaredInternals,
  lids: ReadonlySet<string> | undefined,
): ReadonlyArray<readonly [string, JsonSchema]> {
  const { type } = internals.resource.names;
  const operations = new Set(internals.resource.declaration.operations);
  return [
    [schemaKey(type, 'resource'), resourceObjectSchema(internals)],
    [schemaKey(type, 'identifier'), identifierSchema(internals)],
    ...(operations.has('create')
      ? [
          [
            schemaKey(type, 'create'),
            requestObjectSchema(internals, 'create'),
          ] as const,
        ]
      : []),
    ...(operations.has('update')
      ? [
          [
            schemaKey(type, 'update'),
            requestObjectSchema(internals, 'update'),
          ] as const,
        ]
      : []),
    ...(lids === undefined ? [] : atomicSchemas(internals, lids)),
  ];
}

/** The one origin every resource's links share, or `undefined` when they are paths. */
function serverOf(
  origins: ReadonlyArray<string | undefined>,
): string | undefined {
  const distinct = [...new Set(origins)];
  const [only] = distinct;
  if (distinct.length > 1) {
    throw new TypeError(
      `openapi: the resources' links have different origins (${distinct.map(String).join(', ')}); one document describes one server`,
    );
  }
  return only;
}

/** The error responses of each operation, and the components they reference. */
interface ErrorDocumentation {
  readonly responses: OperationContext['errors'];
  /** The error responses of `codes`; a `TypeError` for a code the catalog lacks. */
  readonly codes: (
    codes: ReadonlyArray<string>,
  ) => ReturnType<OperationContext['errors']>;
  /** The object of every code a response built so far references, by component key, in catalog order. */
  readonly objects: () => ReadonlyArray<readonly [string, JsonSchema]>;
  /** The response of every code a status built so far carries alone, by component key, in catalog order. */
  readonly loneResponses: () => ReadonlyArray<
    readonly [string, ResponseObject]
  >;
}

function errorDocumentation(
  resources: ReadonlyArray<AnyDeclaredResource>,
  options: OpenApiOptions,
): ErrorDocumentation {
  const ban = createBan({
    errors: { ...ERROR_CATALOG, ...errorCatalog(resources, options.appErrors) },
    docsBaseUrl: options.errors?.docsBaseUrl,
    format: jsonApi({ ...options.errors?.format, mixedEntries: true }),
  });
  const referenced = new Set<string>();
  const alone = new Set<string>();
  const responseRef = (code: string): string => {
    alone.add(code);
    return errorResponseRef(code);
  };
  const inCatalogOrder = (codes: ReadonlySet<string>): Array<string> =>
    Object.keys(ban.catalog).filter((code) => codes.has(code));
  const responsesOf = (codes: ReadonlyArray<string>) => {
    const unknown = codes.find((code) => !Object.hasOwn(ban.catalog, code));
    if (unknown !== undefined) {
      throw new TypeError(
        `openapi: codes: ${unknown} is not a code of the catalog; give it in appErrors`,
      );
    }
    for (const code of codes) {
      referenced.add(code);
    }
    return errorResponses(ban, codes, { objectRef: errorRef, responseRef });
  };
  return {
    responses: (internals: DeclaredInternals, operation: DocumentOperation) =>
      responsesOf(operationCodes(internals, operation, options.codes)),
    codes: responsesOf,
    objects: () =>
      Object.entries(errorObjectSchemas(ban, inCatalogOrder(referenced))).map(
        ([code, schema]) => [errorKey(code), schema] as const,
      ),
    loneResponses: () =>
      Object.entries(
        errorResponseObjects(ban, inCatalogOrder(alone), {
          objectRef: errorRef,
        }),
      ).map(([code, response]) => [errorKey(code), response] as const),
  };
}

/** The OpenAPI 3.1 document of `resources`; throws `TypeError` for a registry or an option it refuses. */
export function openapi(
  resources: ReadonlyArray<AnyDeclaredResource>,
  options: OpenApiOptions,
): OpenApiDocument {
  const { internals: listed } = checkRegistry(
    'openapi',
    resources,
    options.appErrors,
  );
  const errors = errorDocumentation(resources, options);
  checkExamples(listed, options.examples);
  const context: OperationContext = {
    errors: errors.responses,
    examples: (type, body) => {
      const internals = listed.find(
        (candidate) => candidate.resource.names.type === type,
      );
      return internals === undefined
        ? undefined
        : exampleObjects(internals, body, options.examples);
    },
  };
  const located = listed.map((internals) => ({
    internals,
    paths: resourcePaths(internals.resource.resource, { caller: 'openapi' }),
  }));
  const server = serverOf(located.map(({ paths }) => paths.origin));
  const paths: Record<string, PathItem> = {};
  for (const { internals, paths: resourcePathsOf } of located) {
    for (const [path, item] of pathItems(internals, resourcePathsOf, context)) {
      if (Object.hasOwn(paths, path)) {
        throw new TypeError(`openapi: two resources have the path ${path}`);
      }
      paths[path] = item;
    }
  }
  const lids = servesOperations(listed) ? lidTypes(listed) : undefined;
  if (lids !== undefined) {
    const path = operationsPath(located.map(({ paths: of }) => of.operations));
    // Only a collection can: every other path of a resource holds its id.
    const taken = located.find(({ paths: of }) => of.collection === path);
    if (taken !== undefined) {
      throw new TypeError(
        `openapi: the operations endpoint's path, ${path}, is the collection path of ${taken.internals.resource.names.type}`,
      );
    }
    paths[path] = {
      post: atomicOperation(
        listed,
        errors.codes(atomicCodes(listed, options.codes)),
      ),
    };
  }
  return {
    openapi: OPENAPI_VERSION,
    info: options.info,
    ...(server === undefined ? {} : { servers: [{ url: server }] }),
    paths,
    components: {
      schemas: Object.fromEntries([
        ...listed.flatMap((internals) => componentSchemas(internals, lids)),
        ...errors.objects(),
      ]),
      responses: Object.fromEntries(errors.loneResponses()),
    },
  };
}
