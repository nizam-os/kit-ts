/**
 * The operations endpoint's request schema against the processor it
 * describes (SPEC 13.1, jsonapi SPEC 11.2 to 11.4): over one registry, each
 * operations document is accepted by the schema exactly when
 * `@nizam-os/jsonapi-core`'s processor runs it, but for what a schema
 * cannot judge as the processor does (`UNSTATED`): what an `href` names,
 * whether a `lid` was defined by an earlier `add`, a `lid` the processor
 * ignores beside the `id` that names the resource, and a non-nullable
 * relationship set to `null`, which only the runtime behind the processor
 * refuses.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 */
import { describe, expect, it } from 'vitest';

import { ACCEPTED, UNSTATED } from '../test-support/atomic-documents';
import { REFUSED } from '../test-support/atomic-refusals';
import { ATOMIC_RESOURCES, processes } from '../test-support/atomic-registry';
import { documentValidator } from '../test-support/openapi-document';
import { openapi } from './document';

const ATOMIC = 'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"';
const DOCUMENT = openapi(ATOMIC_RESOURCES, {
  info: { title: 'Teams', version: '1' },
});
const accepts = documentValidator(DOCUMENT)([
  'paths',
  '/api/operations',
  'post',
  'requestBody',
  'content',
  ATOMIC,
  'schema',
]);

describe('the operations request schema, held to the processor', () => {
  it.each(ACCEPTED)(
    'accepts %s, as the processor runs it',
    async (_label, document) => {
      expect(await processes(document)).toBe(true);
      expect(accepts(document)).toBe(true);
    },
  );

  it.each(REFUSED)(
    'refuses %s, as the processor does',
    async (_label, document) => {
      expect(await processes(document)).toBe(false);
      expect(accepts(document)).toBe(false);
    },
  );

  it.each(UNSTATED)(
    'leaves %s to the server',
    async (_label, document, processed) => {
      expect(await processes(document)).toBe(processed);
      expect(accepts(document)).toBe(!processed);
    },
  );
});
