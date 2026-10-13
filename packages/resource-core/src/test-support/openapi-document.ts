/**
 * Validation of values against a generated OpenAPI document's own schemas
 * (SPEC 13.1): the document is added to an Ajv 2020-12 instance with the
 * document's formats (`openapi-ajv.ts`), its OpenAPI members declared as
 * vocabulary, so a schema anywhere in it, a response's or a component's,
 * compiles by its JSON Pointer with its `$ref`s resolved inside the
 * document. Not published with the package.
 * @ref https://ajv.js.org/api.html#ajv-addvocabulary-vocabulary-ajv
 * @ref https://www.rfc-editor.org/rfc/rfc6901
 * @packageDocumentation
 */
import { openApiAjv } from './openapi-ajv';

const DOCUMENT_ID = 'https://nizam-kit.test/openapi.json';
const OPENAPI_MEMBERS = [
  'openapi',
  'info',
  'servers',
  'paths',
  'components',
  'webhooks',
  'security',
  'tags',
  'externalDocs',
];

/** An RFC 6901 reference token. */
function token(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** A validator of the schema at `segments` in `document`, e.g. `['paths', '/api/contacts', 'get', 'responses', '200', 'content', 'application/vnd.api+json', 'schema']`. */
export function documentValidator(
  document: unknown,
): (segments: ReadonlyArray<string>) => (value: unknown) => boolean {
  const ajv = openApiAjv();
  ajv.addVocabulary(OPENAPI_MEMBERS);
  ajv.addSchema({ ...(document as Record<string, unknown>), $id: DOCUMENT_ID });
  return (segments) => {
    const pointer = segments.map((segment) => `/${token(segment)}`).join('');
    const validate = ajv.getSchema(`${DOCUMENT_ID}#${pointer}`);
    if (validate === undefined) {
      throw new Error(`no schema at ${pointer}`);
    }
    return (value) => validate(value) === true;
  };
}
