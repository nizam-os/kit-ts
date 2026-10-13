import { describe, expect, it } from 'vitest';

/**
 * Package surface. Every subpath of the four packages must resolve
 * through the published `exports` maps at runtime and export exactly what
 * the SPEC lists. Value imports on purpose: a missing dist file or a wrong
 * `exports` entry fails here before any feature test runs.
 */
import { BanError } from '@nizam-os/hono-ban';
import * as hono from '@nizam-os/hono-jsonapi';
import * as honoAtomic from '@nizam-os/hono-jsonapi/atomic';
import * as client from '@nizam-os/jsonapi-client';
import * as kit from '@nizam-os/jsonapi-core';
import * as kitAtomic from '@nizam-os/jsonapi-core/atomic';
import * as query from '@nizam-os/tanstack-query-jsonapi';

function names(module: object): Array<string> {
  return Object.keys(module).toSorted();
}

/** SPEC section 1: the core's values. */
const CORE = [
  'ATOMIC_OPERATIONS_EXTENSION',
  'BanError',
  'CURSOR_PAGINATION_PROFILE',
  'ERROR_CATALOG',
  'ERROR_CODES',
  'JSON_API_MEDIA_TYPE',
  'JSON_API_VERSION',
  'MAX_SIZE_EXCEEDED_TYPE',
  'RANGE_PAGINATION_NOT_SUPPORTED_TYPE',
  'UNSUPPORTED_SORT_TYPE',
  'applyFields',
  'assertFullLinkage',
  'assertMemberName',
  'collectionDocument',
  'createDefineResource',
  'defineResource',
  'errorDocument',
  'errorItem',
  'errorObjects',
  'formatJsonApiMediaType',
  'identify',
  'include',
  'invalidCursor',
  'invalidCursorError',
  'isAtMember',
  'isBanError',
  'isExtensionMemberName',
  'isJsonApiMediaType',
  'isMemberName',
  'isMemberPath',
  'itemCursorMeta',
  'jsonApiBan',
  'jsonApiError',
  'jsonApiObject',
  'jsonApiParameters',
  'maxPageSizeExceededError',
  'negotiate',
  'pageMeta',
  'paginatedDocument',
  'paginationLinks',
  'parseAccept',
  'parseCreateDocument',
  'parseIdentifier',
  'parseLinkage',
  'parseMediaType',
  'parseQuery',
  'parseResourceObject',
  'parseToManyRelationshipDocument',
  'parseToOneRelationshipDocument',
  'parseUpdateDocument',
  'primaryData',
  'rangePaginationNotSupportedError',
  'relatedResource',
  'resourceDocument',
  'resourcePaths',
  'serializeResource',
  'toManyLinkage',
  'toOneLinkage',
  'toManyRelationshipDocument',
  'toOneRelationshipDocument',
  'unsupportedSort',
  'unsupportedSortError',
].toSorted();

/** SPEC section 11: the core extension's values. */
const CORE_ATOMIC = [
  'DEFAULT_MAX_OPERATIONS',
  'assertOperationsContentType',
  'errorAtOperation',
  'operationsProcessor',
  'parseOperationsDocument',
].toSorted();

/** SPEC section 10: what the Hono adapter adds. */
const HONO = [
  'bodyValidator',
  'errorHandler',
  'isJsonApiResponse',
  'jsonApi',
  'notFoundHandler',
  'queryValidator',
  'readDocument',
  'relationshipValidator',
  'respond',
  'respondError',
  'varyAccept',
];

/** SPEC section 15.1: the client's values, the operations' of section 17 among them. */
const CLIENT = [
  'ResponseError',
  'createClients',
  'createTransport',
  'cursorOf',
  'deserialize',
  'isResponseError',
  'operationOf',
  'operationsOf',
  'pageCursors',
  'sendOperations',
  'serializeQuery',
].toSorted();

describe('@nizam-os/jsonapi-core surface', () => {
  it('the root exports the SPEC section 1 values', () => {
    expect(names(kit)).toEqual(CORE);
    expect(kit.JSON_API_MEDIA_TYPE).toBe('application/vnd.api+json');
    expect(kit.JSON_API_VERSION).toBe('1.1');
    expect(kit.ATOMIC_OPERATIONS_EXTENSION).toBe(
      'https://jsonapi.org/ext/atomic',
    );
    expect(kit.CURSOR_PAGINATION_PROFILE).toBe(
      'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/',
    );
  });

  it('the atomic subpath exports the processor, the content type check, and the document parser', () => {
    expect(names(kitAtomic)).toEqual(CORE_ATOMIC);
  });
});

describe('@nizam-os/hono-jsonapi surface', () => {
  it('the root re-exports the core, the same bindings, and adds the Hono integration', () => {
    expect(names(hono)).toEqual([...CORE, ...HONO].toSorted());
    // One copy of the core in the graph, and one copy of @nizam-os/ban-core under it:
    // an error thrown through any of the packages is the same class, so
    // instanceof holds across them.
    expect(hono.BanError).toBe(kit.BanError);
    expect(kit.BanError).toBe(BanError);
    expect(hono.defineResource).toBe(kit.defineResource);
  });

  it('the atomic subpath re-exports the core extension and adds the Hono handler', () => {
    expect(names(honoAtomic)).toEqual(
      [...CORE_ATOMIC, 'atomicOperations'].toSorted(),
    );
    expect(honoAtomic.operationsProcessor).toBe(kitAtomic.operationsProcessor);
  });
});

describe('@nizam-os/jsonapi-client surface', () => {
  it('the root exports the SPEC section 15.1 values', () => {
    expect(names(client)).toEqual(CLIENT);
  });
});

describe('@nizam-os/tanstack-query-jsonapi surface', () => {
  it('the root exports the SPEC section 16.1 values', () => {
    expect(names(query)).toEqual(['operationsMutation', 'resourceQueries']);
  });
});
