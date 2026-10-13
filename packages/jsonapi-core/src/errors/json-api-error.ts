/**
 * JSON:API errors on @nizam-os/ban-core (SPEC 4.2). Every error this package throws is
 * a @nizam-os/ban-core `BanError` built by `jsonApiBan`, an instance whose catalog adds
 * `ERROR_CATALOG` to the built-ins and whose format is @nizam-os/ban-core's JSON:API
 * format with `mixedEntries` on. The error's `errors` list holds one
 * `ErrorItem` per JSON:API error object: the object's `source` is the
 * item's `location` and `path` (the format turns them back into `pointer`,
 * `parameter`, or `header`), its `links.type` is the item's `type`, and its
 * `status`, `code`, and `title` are the item's own, so one document can
 * combine catalog entries. The response status is the one the specification
 * derives from the objects. Any @nizam-os/ban-core handler renders such an error in its
 * own format; `errorDocument` renders it here as the JSON:API format does,
 * for callers that build a response by hand.
 * @ref https://jsonapi.org/format/1.1/#errors
 * @ref https://jsonapi.org/format/1.1/#errors-processing
 * @ref https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md (sections 4.2 and 7.2)
 * @packageDocumentation
 */
import type {
  Ban,
  BanError,
  BanErrorOptions,
  ErrorItem,
  ErrorKey,
} from '@nizam-os/ban-core';
import type { JsonApiBody } from '@nizam-os/ban-core/formats/json-api';

import type {
  DocumentBase,
  ErrorDocument,
  ErrorObject,
  ErrorSource,
  Meta,
} from '../document/types';
import type { JsonApiCatalog } from './catalog';

import { createBan } from '@nizam-os/ban-core';
import { jsonApi, responseStatus } from '@nizam-os/ban-core/formats/json-api';

import { HTTP_INTERNAL_SERVER_ERROR } from '../internal/constants';
import { compact } from '../internal/object';
import { pathFromPointer } from '../internal/pointer';
import { ERROR_CATALOG } from './catalog';

/** A code the builders accept: one of this package's or a @nizam-os/ban-core built-in. */
export type JsonApiErrorCode = ErrorKey<JsonApiCatalog>;

/**
 * The instance behind every error this package builds. Its factories
 * (`jsonApiBan.notFound()`, `jsonApiBan.INVALID_DOCUMENT()`, ...),
 * `validation()`, `from()`, `handler()`, and `render()` are @nizam-os/ban-core's; an
 * application that needs its own entries creates its own instance with
 * `ERROR_CATALOG` spread into `errors`, since any instance renders any
 * `BanError`.
 */
export const jsonApiBan: Ban<JsonApiCatalog> = createBan({
  errors: ERROR_CATALOG,
  format: jsonApi({ mixedEntries: true }),
});

/** The members of one error object that vary per occurrence. */
export interface ErrorItemInit {
  readonly detail: string;
  /**
   * `pointer`, `parameter`, or `header`, in that order of precedence when
   * several are given: an item addresses one part of the request.
   */
  readonly source?: ErrorSource | undefined;
  readonly meta?: Meta | undefined;
  /** A validator's own code for the problem (`maxLength`), rendered as `meta.code`; never a catalog code. */
  readonly reason?: string | undefined;
  /** What the validator expected (`200`), rendered as `meta.expected`. */
  readonly expected?: string | undefined;
}

export interface JsonApiErrorOptions {
  /** The underlying failure, for reports; never rendered. */
  readonly cause?: unknown;
  /** Headers every response for this error carries, such as `Allow` or `Vary`, as a `BanError` takes them. */
  readonly headers?: BanErrorOptions['headers'];
}

export type ErrorObjectInit = ErrorItemInit & JsonApiErrorOptions;

function isList(
  value: ErrorItem | ReadonlyArray<ErrorItem>,
): value is ReadonlyArray<ErrorItem> {
  return Array.isArray(value);
}

/**
 * A `source` as @nizam-os/ban-core addresses it: a pointer is a path with no location
 * (the format renders a located-nowhere path as `pointer`), a parameter or
 * header name is a one-segment path in that location.
 */
function address(
  source: ErrorSource | undefined,
): Pick<ErrorItem, 'location' | 'path'> {
  if (source?.pointer !== undefined) {
    return { path: pathFromPointer(source.pointer) };
  }
  if (source?.parameter !== undefined) {
    return { location: 'query', path: [source.parameter] };
  }
  if (source?.header !== undefined) {
    return { location: 'header', path: [source.header] };
  }
  return {};
}

/**
 * One `ErrorItem` carrying the catalog entry's identity (`status`, `code`,
 * `title`, and its `type` link when the entry declares one) and the
 * occurrence's members. Items go into `jsonApiError(items)` when a parser
 * reports several problems at once.
 */
export function errorItem(
  code: JsonApiErrorCode,
  init: ErrorItemInit,
): ErrorItem {
  const definition = jsonApiBan.catalog[code];
  return {
    status: definition.status,
    code: definition.code,
    title: definition.title,
    ...(definition.type === undefined ? {} : { type: definition.type }),
    detail: init.detail,
    ...address(init.source),
    ...(init.meta === undefined ? {} : { meta: init.meta }),
    ...(init.reason === undefined ? {} : { reason: init.reason }),
    ...(init.expected === undefined ? {} : { expected: init.expected }),
  };
}

function inCatalog(code: string | undefined): code is JsonApiErrorCode {
  return code !== undefined && Object.hasOwn(jsonApiBan.catalog, code);
}

/**
 * The error for a list of items. When every item carries the same catalog
 * code, the error is that entry; otherwise it is the primary entry for the
 * "most generally applicable" status (the common status, 400 when the items
 * disagree but are all 4xx, else 500), and each item keeps its own identity
 * in the document. A single item's `detail` becomes the error's, so logs
 * and the other formats show it.
 */
function fromItems(
  errors: ReadonlyArray<ErrorItem>,
  options: JsonApiErrorOptions,
): BanError {
  const [first] = errors;
  if (first === undefined) {
    throw new TypeError('jsonApiError needs at least one error item');
  }
  const codes = new Set(errors.map((item) => item.code));
  const init = {
    errors,
    detail: errors.length === 1 ? first.detail : undefined,
    cause: options.cause,
    headers: options.headers,
  };
  return codes.size === 1 && inCatalog(first.code)
    ? jsonApiBan.error(first.code, init)
    : jsonApiBan.fromStatus(
        responseStatus(errors) ?? HTTP_INTERNAL_SERVER_ERROR,
        init,
      );
}

function fromCode(
  code: JsonApiErrorCode,
  init: Partial<ErrorItemInit> & JsonApiErrorOptions,
): BanError {
  const options = { cause: init.cause, headers: init.headers };
  if (init.source === undefined && init.meta === undefined) {
    return jsonApiBan.error(code, { ...options, detail: init.detail });
  }
  if (init.detail === undefined) {
    throw new TypeError(
      'jsonApiError: an error object with a source or meta needs a detail',
    );
  }
  return fromItems(
    [
      errorItem(code, {
        detail: init.detail,
        source: init.source,
        meta: init.meta,
      }),
    ],
    options,
  );
}

/**
 * One error object from the catalog, or an error over a list of items.
 * `jsonApiError('NOT_FOUND')` renders the entry's identity alone;
 * `jsonApiError('CONFLICT', { detail, source: { pointer: '/data/id' } })`
 * adds the occurrence's members. Callers throw the result; a @nizam-os/ban-core
 * handler, Hono's default error handler (through `getResponse()`), or
 * `errorDocument` renders it.
 */
export function jsonApiError(
  code: JsonApiErrorCode,
  init?: ErrorObjectInit,
): BanError;
export function jsonApiError(
  errors: ErrorItem | ReadonlyArray<ErrorItem>,
  options?: JsonApiErrorOptions,
): BanError;
export function jsonApiError(
  first: JsonApiErrorCode | ErrorItem | ReadonlyArray<ErrorItem>,
  second: Partial<ErrorItemInit> & JsonApiErrorOptions = {},
): BanError {
  if (typeof first === 'string') {
    return fromCode(first, second);
  }
  return fromItems(isList(first) ? first : [first], second);
}

/**
 * The error objects the JSON:API format renders for any `BanError`, in
 * document order: one per item, or one for the error itself when it has no
 * list. Each carries the error's `id`; a located item adds `meta.location`.
 */
export function errorObjects(error: BanError): ReadonlyArray<ErrorObject> {
  const { body } = jsonApiBan.render(error);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: @nizam-os/ban-core types every format's rendered body as `unknown` (`RenderedError.body`); this instance renders with `jsonApi()`, whose body is a `JsonApiBody` by its own contract (@nizam-os/ban-core SPEC 7.2)
  return (body as JsonApiBody).errors;
}

/** An error document for any `BanError`, with the top-level members of `base`. */
export function errorDocument(
  error: BanError,
  base: DocumentBase = {},
): ErrorDocument {
  return compact({
    jsonapi: base.jsonapi,
    links: base.links,
    meta: base.meta,
    errors: errorObjects(error),
  });
}
