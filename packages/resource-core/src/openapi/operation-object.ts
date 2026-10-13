/**
 * The parts every operation of the document shares (SPEC 13.1): its id,
 * `<type>.<operation>`, unique since types are; its tag, the type; its
 * bodies under the JSON:API media type; and its responses, the success
 * the operation names with the error responses of its codes, a status that
 * carries one code a reference to that code's response.
 * @ref https://spec.openapis.org/oas/v3.1.2.html#operation-object
 * @ref https://jsonapi.org/format/1.1/#content-negotiation
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';
import type {
  ReferenceObject,
  ResponseObject,
} from '@nizam-os/ban-core/openapi';

import type { DeclaredInternals } from '../declare/declared-resource';
import type { DocumentOperation } from './operation-codes';
import type { ParameterObject } from './parameters';

/** The JSON:API media type, without parameters (jsonapi SPEC 3.2). */
const JSON_API_MEDIA_TYPE = 'application/vnd.api+json';

/** The bodies a business example may be given for (SPEC 13.1). */
export type ExampleBody = 'create' | 'update' | 'get';

/** A Media Type Object of the JSON:API media type. */
export type Content = Readonly<
  Record<
    string,
    {
      readonly schema: JsonSchema;
      readonly examples?: Readonly<Record<string, unknown>>;
    }
  >
>;

/** A Request Body Object: every body the document describes is required. */
interface RequestBody {
  readonly required: true;
  readonly content: Content;
}

/** A success response. */
export interface SuccessObject {
  readonly description: string;
  readonly content?: Content;
  readonly headers?: Readonly<Record<string, unknown>>;
}

/** An OpenAPI Operation Object as the document builds it. */
export interface OperationObject {
  readonly operationId: string;
  readonly summary: string;
  readonly tags: ReadonlyArray<string>;
  readonly parameters?: ReadonlyArray<ParameterObject>;
  readonly requestBody?: RequestBody;
  readonly responses: Readonly<
    Record<string, SuccessObject | ResponseObject | ReferenceObject>
  >;
}

/** An OpenAPI Path Item Object, by lowercase method. */
export type PathItem = Partial<
  Record<'get' | 'post' | 'patch' | 'delete', OperationObject>
>;

/** What an operation reads from the document: its error responses and the examples of its bodies. */
export interface OperationContext {
  readonly errors: (
    internals: DeclaredInternals,
    operation: DocumentOperation,
  ) => Readonly<Record<string, ResponseObject | ReferenceObject>>;
  readonly examples: (
    type: string,
    body: ExampleBody,
  ) => Readonly<Record<string, unknown>> | undefined;
}

/** A body of `schema`, with its examples when any are given. */
export function content(
  schema: JsonSchema,
  examples?: Readonly<Record<string, unknown>>,
): Content {
  return {
    [JSON_API_MEDIA_TYPE]: {
      schema,
      ...(examples === undefined ? {} : { examples }),
    },
  };
}

export function success(
  description: string,
  schema: JsonSchema,
  examples?: Readonly<Record<string, unknown>>,
): SuccessObject {
  return { description, content: content(schema, examples) };
}

/** What an operation names itself; its id is prefixed with the type. */
export interface OperationParts {
  readonly id: string;
  readonly summary: string;
  readonly parameters?: ReadonlyArray<ParameterObject>;
  readonly requestBody?: RequestBody;
  readonly ok: Readonly<Record<string, SuccessObject>>;
}

export function operationObject(
  internals: DeclaredInternals,
  operation: DocumentOperation,
  context: OperationContext,
  parts: OperationParts,
): OperationObject {
  const { type } = internals.resource.names;
  const { id, ok, ...rest } = parts;
  return {
    operationId: `${type}.${id}`,
    tags: [type],
    ...rest,
    responses: { ...ok, ...context.errors(internals, operation) },
  };
}
