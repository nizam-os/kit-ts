import type { ErrorObject } from 'ajv/dist/2020.js';

/**
 * An OpenAPI document as a client holds a server to it (resource SPEC
 * 13.1): a response's status is one the operation documents, its media
 * type one that status's response lists, its body valid against that
 * schema, each error's code among the codes the response lists, and a
 * `201`'s `Location` valid against its header's schema; a request document
 * is checked against the operation's request body. Schemas compile with Ajv
 * 2020-12 in strict mode, every format the document names asserted:
 * ajv-formats' own, and `int16`, `decimal`, and `date-time-local` of the
 * OpenAPI Format Registry. The document is added whole under an `$id`, its
 * OpenAPI members declared as vocabulary, so a schema anywhere in it
 * compiles by its JSON Pointer with its `$ref`s resolved in the document.
 * A response that is a Reference Object is read where it points, in
 * `components.responses`. A response's media type is the most specific
 * key of the status's content that matches its `Content-Type`: the same
 * type and subtype, and each parameter the key names, such as the `ext`
 * of an operations response, carried with the same value.
 * @ref https://spec.openapis.org/oas/v3.1.2.html#responses-object
 * @ref https://spec.openapis.org/oas/v3.1.2.html#reference-object
 * @ref https://spec.openapis.org/oas/v3.1.2.html#response-content ("only the most specific key is applicable")
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-12.5.1 (a media range with parameters is more specific)
 * @ref https://spec.openapis.org/registry/format/
 * @ref https://ajv.js.org/api.html#ajv-addvocabulary-vocabulary-ajv
 * @ref https://www.rfc-editor.org/rfc/rfc6901
 */
import type { OpenApiDocument } from '@nizam-os/resource-core/openapi';

import type { Sent } from './http.ts';

import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';

import { parseMediaType } from '@nizam-os/jsonapi-core';

import { openApiFormats } from './openapi-formats.ts';

const DOCUMENT_ID = 'https://e2e.nizam-kit.test/openapi.json';
const OPENAPI_MEMBERS = ['openapi', 'info', 'servers', 'paths', 'components'];
/** The prefix of an error object's component; the application's codes are spelled as they are. */
const ERROR_REF = '#/components/schemas/_error.';
/** The prefix of a reference inside the document. */
const LOCAL_REF = '#/';
const CREATED = '201';

export type Method = 'get' | 'post' | 'patch' | 'delete';

/** What a document holds a server to. */
export interface Contract {
  /** How `sent`, the answer to `method` on `path`, breaks the document; empty when it conforms. */
  readonly response: (
    method: Method,
    path: string,
    sent: Sent,
  ) => ReadonlyArray<string>;
  /** How a request document breaks the operation's request body schema; empty when it passes. */
  readonly request: (
    method: Method,
    path: string,
    body: unknown,
  ) => ReadonlyArray<string>;
  /** How `value` breaks the schema at `segments` of the document; empty when it passes. */
  readonly schema: (
    segments: ReadonlyArray<string>,
    value: unknown,
  ) => ReadonlyArray<string>;
  /** The codes the response of `status` lists. */
  readonly codes: (
    method: Method,
    path: string,
    status: number,
  ) => ReadonlyArray<string>;
}

/** An RFC 6901 reference token. */
function token(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The member at `segments`, or `undefined`. */
function at(root: unknown, segments: ReadonlyArray<string>): unknown {
  let node = root;
  for (const segment of segments) {
    node =
      isRecord(node) && Object.hasOwn(node, segment)
        ? node[segment]
        : undefined;
  }
  return node;
}

/** The segments of a reference inside the document, its RFC 6901 tokens decoded; `undefined` for another reference. */
function refSegments(ref: string): Array<string> | undefined {
  return ref.startsWith(LOCAL_REF)
    ? ref
        .slice(LOCAL_REF.length)
        .split('/')
        .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    : undefined;
}

/** Where the response of `status` is: the operation's own entry, or the component its reference names. */
function responseSegments(
  document: OpenApiDocument,
  method: Method,
  path: string,
  status: string,
): ReadonlyArray<string> {
  const own = ['paths', path, method, 'responses', status];
  const entry = at(document, own);
  const ref = isRecord(entry) ? entry['$ref'] : undefined;
  return typeof ref === 'string' ? (refSegments(ref) ?? own) : own;
}

/** Every `$ref` under `node` that names an error object, as its code. */
function referencedCodes(node: unknown): Array<string> {
  if (Array.isArray(node)) {
    return node.flatMap((item) => referencedCodes(item));
  }
  if (!isRecord(node)) {
    return [];
  }
  const ref = node['$ref'];
  const own =
    typeof ref === 'string' && ref.startsWith(ERROR_REF)
      ? [ref.slice(ERROR_REF.length)]
      : [];
  return [
    ...own,
    ...Object.values(node).flatMap((value) => referencedCodes(value)),
  ];
}

/** The codes of a JSON:API error document's errors. */
function sentCodes(body: unknown): Array<string> {
  const errors = isRecord(body) ? body['errors'] : undefined;
  return Array.isArray(errors)
    ? errors.map((error: unknown) =>
        isRecord(error) ? String(error['code']) : '',
      )
    : [];
}

/** A parameter of a media type as one string; a name is lowercase already, and its value keeps its case. */
function parameterOf({
  name,
  value,
}: {
  readonly name: string;
  readonly value: string;
}): string {
  return `${name}=${value}`;
}

/** The key of `content` that matches `contentType` most specifically, or `undefined`. */
function listedMedia(
  content: Readonly<Record<string, unknown>>,
  contentType: string,
): string | undefined {
  const sent = parseMediaType(contentType);
  if (sent === undefined) {
    return undefined;
  }
  const carried = new Set(sent.parameters.map(parameterOf));
  const matching = Object.keys(content).flatMap((key) => {
    const listed = parseMediaType(key);
    return listed !== undefined &&
      listed.type === sent.type &&
      listed.subtype === sent.subtype &&
      listed.parameters.every((parameter) =>
        carried.has(parameterOf(parameter)),
      )
      ? [{ key, specificity: listed.parameters.length }]
      : [];
  });
  return matching.toSorted((a, b) => b.specificity - a.specificity)[0]?.key;
}

function described(
  errors: ReadonlyArray<ErrorObject> | null | undefined,
): Array<string> {
  return (errors ?? []).map(
    (error) =>
      `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? ''}`,
  );
}

/** The contract of `document`. */
export function contractOf(document: OpenApiDocument): Contract {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  openApiFormats(ajv);
  ajv.addVocabulary(OPENAPI_MEMBERS);
  ajv.addSchema({ ...document, $id: DOCUMENT_ID });
  const validate = (
    segments: ReadonlyArray<string>,
    value: unknown,
  ): Array<string> => {
    const pointer = segments.map((segment) => `/${token(segment)}`).join('');
    const compiled = ajv.getSchema(`${DOCUMENT_ID}#${pointer}`);
    if (compiled === undefined) {
      return [`no schema at ${pointer}`];
    }
    return compiled(value) === true ? [] : described(compiled.errors);
  };
  const codes = (
    method: Method,
    path: string,
    status: number,
  ): Array<string> => [
    ...new Set(
      referencedCodes(
        at(document, responseSegments(document, method, path, String(status))),
      ),
    ),
  ];
  return {
    codes,
    schema: validate,
    request: (method, path, body) => {
      const content = at(document, [
        'paths',
        path,
        method,
        'requestBody',
        'content',
      ]);
      const [media] = isRecord(content) ? Object.keys(content) : [];
      return media === undefined
        ? [`${method} ${path} takes no request document`]
        : validate(
            ['paths', path, method, 'requestBody', 'content', media, 'schema'],
            body,
          );
    },
    response: (method, path, sent) => {
      const status = String(sent.status);
      const where = responseSegments(document, method, path, status);
      const response = at(document, where);
      if (!isRecord(response)) {
        return [`${method} ${path} documents no ${status}`];
      }
      const content = isRecord(response['content']) ? response['content'] : {};
      const contentType = sent.headers.get('Content-Type') ?? sent.mediaType;
      if (sent.mediaType === undefined || contentType === undefined) {
        return Object.keys(content).length === 0
          ? []
          : [`${status} has no body`];
      }
      const media = listedMedia(content, contentType);
      if (media === undefined) {
        return [`${status} documents no ${contentType}`];
      }
      const listed = new Set(codes(method, path, sent.status));
      return [
        ...validate([...where, 'content', media, 'schema'], sent.body),
        ...sentCodes(sent.body)
          .filter((code) => !listed.has(code))
          .map((code) => `${status} does not list ${code}`),
        ...(status === CREATED
          ? validate(
              [...where, 'headers', 'Location', 'schema'],
              sent.headers.get('Location'),
            )
          : []),
      ];
    },
  };
}
