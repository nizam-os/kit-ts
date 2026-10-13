/**
 * A create's or an update's input as the runtime takes it (SPEC 18.4,
 * 18.5), whether a host parsed it from a request document or a worker
 * wrote it: the declaration's write schema validates it, and the members
 * it accepted become the storage write, each relationship as its
 * target's id. A refusal is `VALIDATION_FAILED` with an item per issue at
 * the issue's place in the document (SPEC 9.3): under `attributes` as the
 * issue names it, and under a relationship's `data`, which carries its
 * linkage. A create's `id` is validated by the key's form on a resource
 * that takes client ids, and stored as the form outputs it; any other
 * resource refuses it, as `@nizam-os/jsonapi-core` refuses it in a request.
 * An update's row is named by its URL's id, so the input's own is not
 * read. The id of a get, an update, or a remove that the key's form
 * refuses names no row, so it is `NOT_FOUND` before any query (SPEC 3.4,
 * 12.3).
 * @ref https://jsonapi.org/format/1.1/#crud-creating-client-ids
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-relationships
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';
import type { DeclaredResource, ResourceIssue } from '@nizam-os/resource-core';
import type {
  ResourceInput,
  StorageWrite,
} from '@nizam-os/resource-core/server';

import { BanError, BUILTIN_CATALOG } from '@nizam-os/ban-core';
import { errorItem, jsonApiError } from '@nizam-os/jsonapi-core';

import { isRecord } from '../internal/object';

/** The resource object of a request document. */
const DATA = 'data';

/** The error of a missing row, which a denied get, update, or remove also is (SPEC 12.2). */
export function notFound(): BanError {
  return new BanError({ ...BUILTIN_CATALOG.NOT_FOUND, code: 'NOT_FOUND' });
}

/** The id as the key's form outputs it; `NOT_FOUND` for one the form refuses. */
export function knownId(resource: DeclaredResource, id: string): string {
  const known = resource.validate.id['~standard'].validate(id);
  if (known.issues !== undefined) {
    throw notFound();
  }
  return known.value;
}

/** Where an issue of the write schema sits in the resource object: a relationship's under its `data`. */
function documentPath(issue: ResourceIssue): ReadonlyArray<string> {
  const segments = issue.path.map(String);
  const [part, name, ...rest] = segments;
  return part === 'relationships' && name !== undefined
    ? [DATA, part, name, DATA, ...rest]
    : [DATA, ...segments];
}

/** One `VALIDATION_FAILED` item, as `@nizam-os/jsonapi-core` makes it of an issue (SPEC 9.3). */
function issueItem(
  issue: ResourceIssue,
  path: ReadonlyArray<string>,
): ErrorItem {
  return {
    ...errorItem('VALIDATION_FAILED', {
      detail: issue.message,
      reason: issue.code,
      expected: issue.expected,
    }),
    path,
  };
}

/** A create's client id as the key's form outputs it; refused where the resource takes none. */
function clientId(resource: DeclaredResource, id: string): string {
  if (resource.declaration.clientIds !== true) {
    throw jsonApiError([
      {
        ...errorItem('CLIENT_GENERATED_ID_NOT_SUPPORTED', {
          detail: `"${resource.names.type}" does not accept client-generated ids`,
        }),
        path: [DATA, 'id'],
      },
    ]);
  }
  const result = resource.validate.id['~standard'].validate(id);
  if (result.issues !== undefined) {
    throw jsonApiError(
      result.issues.map((issue) =>
        issueItem(issue, [DATA, 'id', ...issue.path.map(String)]),
      ),
    );
  }
  return result.value;
}

/** A validated relationship's linkage as its target's id, or `null`. */
function targetId(linkage: unknown): string | null {
  const id = isRecord(linkage) ? linkage['id'] : null;
  if (typeof id !== 'string' && id !== null) {
    throw new TypeError('a validated relationship has no id');
  }
  return id;
}

/** The members a validated write carried, relationships as target ids (SPEC 12.8). */
function storageWrite(value: unknown, id: string | undefined): StorageWrite {
  const attributes = isRecord(value) ? value['attributes'] : undefined;
  const relationships = isRecord(value) ? value['relationships'] : undefined;
  if (!isRecord(attributes) || !isRecord(relationships)) {
    throw new TypeError('a validated write has no attributes or relationships');
  }
  return {
    ...(id === undefined ? {} : { id }),
    attributes,
    relationships: Object.fromEntries(
      Object.entries(relationships).map(([name, linkage]) => [
        name,
        targetId(linkage),
      ]),
    ),
  };
}

/** `input` as the declaration's `write` schema parses it; `VALIDATION_FAILED` with an item per issue otherwise. */
export function writeOf(
  resource: DeclaredResource,
  write: 'create' | 'update',
  input: ResourceInput,
): StorageWrite {
  const id =
    write === 'create' && input.id !== undefined
      ? clientId(resource, input.id)
      : undefined;
  const result = resource.write[write]['~standard'].validate({
    attributes: input.attributes ?? {},
    relationships: input.relationships ?? {},
  });
  if (result.issues !== undefined) {
    throw jsonApiError(
      result.issues.map((issue) => issueItem(issue, documentPath(issue))),
    );
  }
  return storageWrite(result.value, id);
}
