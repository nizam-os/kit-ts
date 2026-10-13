/**
 * `ResponseError` (SPEC 15.7): a response whose status is not 2xx, a 4xx
 * and a 5xx alike. It holds the HTTP status, the error document's error
 * objects with their own codes, or none when the body is not an error
 * document (a proxy's HTML page), and the `Allow` and `Retry-After`
 * headers. Its message names the resource type, the call, and the status,
 * never the URL or the body: a URL carries ids and filter values, and a
 * message goes to logs. An error object keeps each member whose type is
 * the one JSON:API gives it, `status` a string and `code` its own, never
 * the HTTP status in its place.
 * @ref https://jsonapi.org/format/1.1/#error-objects
 * @ref https://www.rfc-editor.org/rfc/rfc9110#field.allow
 * @ref https://www.rfc-editor.org/rfc/rfc9110#field.retry-after
 * @packageDocumentation
 */
import type {
  ErrorDocument,
  ErrorObject,
  ErrorSource,
} from '@nizam-os/jsonapi-core';

import type { JsonRecord } from '../internal/object';

import { jsonApiObjectOf, linksOf } from '../document/members';
import { isRecord, ownMember } from '../internal/object';

/** Marks a `ResponseError` across copies of the package, where `instanceof` fails. */
const BRAND = Symbol.for('@nizam-os/jsonapi-client/response-error');

const OBJECT_MEMBERS = ['id', 'status', 'code', 'title', 'detail'] as const;
const SOURCE_MEMBERS = ['pointer', 'parameter', 'header'] as const;

/** The response headers a caller acts on: `Allow` for a 405, `Retry-After` for a 429 or a 503. */
export interface ResponseErrorHeaders {
  readonly allow: string | undefined;
  readonly retryAfter: string | undefined;
}

export interface ResponseErrorInit {
  /** The resource type the call was for. */
  readonly type: string;
  /** The call, such as `list` or `create`. */
  readonly call: string;
  readonly status: number;
  /** The response body as parsed JSON, `undefined` when it is not JSON. */
  readonly body: unknown;
  readonly headers?:
    | { readonly get: (name: string) => string | null }
    | undefined;
}

/** The members of `object` among `keys` whose value is a string. */
function strings<TKey extends string>(
  object: JsonRecord,
  keys: ReadonlyArray<TKey>,
): Partial<Record<TKey, string>> {
  const found: Partial<Record<TKey, string>> = {};
  for (const key of keys) {
    const value = ownMember(object, key);
    if (typeof value === 'string') {
      found[key] = value;
    }
  }
  return found;
}

function errorObjectOf(object: JsonRecord): ErrorObject {
  const source = ownMember(object, 'source');
  const links = ownMember(object, 'links');
  const meta = ownMember(object, 'meta');
  const sourceMembers: ErrorSource | undefined = isRecord(source)
    ? strings(source, SOURCE_MEMBERS)
    : undefined;
  return {
    ...strings(object, OBJECT_MEMBERS),
    ...(sourceMembers === undefined ? {} : { source: sourceMembers }),
    ...(isRecord(links) ? { links: linksOf(links) } : {}),
    ...(isRecord(meta) ? { meta } : {}),
  };
}

/** The body as an error document: its error objects, and its `links`, `meta`, and `jsonapi`. */
function errorDocumentOf(body: unknown): ErrorDocument | undefined {
  const errors = isRecord(body) ? ownMember(body, 'errors') : undefined;
  if (!isRecord(body) || !Array.isArray(errors)) {
    return undefined;
  }
  const links = ownMember(body, 'links');
  const meta = ownMember(body, 'meta');
  const jsonapi = ownMember(body, 'jsonapi');
  return {
    errors: errors.flatMap((object) =>
      isRecord(object) ? [errorObjectOf(object)] : [],
    ),
    ...(isRecord(links) ? { links: linksOf(links) } : {}),
    ...(isRecord(meta) ? { meta } : {}),
    ...(isRecord(jsonapi) ? { jsonapi: jsonApiObjectOf(jsonapi) } : {}),
  };
}

/** A response that is not 2xx. */
export class ResponseError extends Error {
  /** The HTTP status. */
  public readonly status: number;
  /** The error document's error objects; none when the body is not one. */
  public readonly errors: ReadonlyArray<ErrorObject>;
  /** The error document, or `undefined` when the body is not one. */
  public readonly document: ErrorDocument | undefined;
  public readonly headers: ResponseErrorHeaders;

  public constructor(init: ResponseErrorInit) {
    super(`${init.type} ${init.call} answered ${String(init.status)}`);
    this.name = 'ResponseError';
    this.status = init.status;
    this.document = errorDocumentOf(init.body);
    this.errors = this.document?.errors ?? [];
    this.headers = {
      allow: init.headers?.get('Allow') ?? undefined,
      retryAfter: init.headers?.get('Retry-After') ?? undefined,
    };
    Object.defineProperty(this, BRAND, { value: true });
  }
}

/**
 * Whether `value` is a `ResponseError`, and with `code`, one whose error
 * objects carry it. The type parameter types `code`:
 * `isResponseError<AppCode>(error, 'X')` refuses a code the application's
 * catalog does not have.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- reason: SPEC 15.7 types `code` by an explicit argument, `isResponseError<AppCode>(error, code)`; `NoInfer` keeps the argument from choosing it
export function isResponseError<TCode extends string = string>(
  value: unknown,
  code?: NoInfer<TCode>,
): value is ResponseError {
  if (!isRecord(value) || !Object.hasOwn(value, BRAND)) {
    return false;
  }
  if (code === undefined) {
    return true;
  }
  const errors = ownMember(value, 'errors');
  return (
    Array.isArray(errors) &&
    errors.some((error) => isRecord(error) && ownMember(error, 'code') === code)
  );
}
