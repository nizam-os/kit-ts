import type { SchemaValidator } from '@nizam-os/hono-ban/testing';

import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';

/**
 * Validators for the schemas of a served OpenAPI 3.1 document with their
 * `$ref`s resolved inside the document (Ajv 2020-12, strict). The document
 * is added whole under an `$id`, its top-level members declared as
 * vocabulary so strict mode accepts them, and a schema anywhere in it
 * compiles by its JSON Pointer.
 * @ref https://ajv.js.org/api.html#ajv-addvocabulary-vocabulary-ajv
 * @ref https://www.rfc-editor.org/rfc/rfc6901
 */
const DOCUMENT_ID = 'https://e2e.nizam-kit.test/openapi.json';

/** An RFC 6901 reference token. */
function token(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** A validator of the schema at `segments`, e.g. `['paths', '/reports', 'get', 'responses', '400', 'content', 'application/vnd.api+json', 'schema']`. */
export function documentValidator(
  document: Readonly<Record<string, unknown>>,
): (segments: ReadonlyArray<string>) => SchemaValidator {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addVocabulary(Object.keys(document));
  ajv.addSchema({ ...document, $id: DOCUMENT_ID });
  return (segments) => {
    const pointer = segments.map((segment) => `/${token(segment)}`).join('');
    const validate = ajv.getSchema(`${DOCUMENT_ID}#${pointer}`);
    if (validate === undefined) {
      throw new Error(`no schema at ${pointer}`);
    }
    return (body: unknown): ReadonlyArray<string> =>
      validate(body) === true
        ? []
        : (validate.errors ?? []).map(
            (error) =>
              `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? ''}`,
          );
  };
}
