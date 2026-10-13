/**
 * What every operation runner shares (SPEC 11.4): the execution state and
 * the lookups and checks the runners make before calling a handler.
 * @packageDocumentation
 */
import type { BanError } from '@nizam-os/ban-core';

import type { ResourceLinkage, ResourceObject } from '../document/types';
import type { AnyResource } from '../resource/types';
import type { Lids } from './lids';
import type { RawOperation } from './parse-document';
import type {
  AnyResourceHandlers,
  OperationContext,
  OperationTarget,
  ResolvedResourceObject,
} from './types';

import { serializeResource } from '../document/serialize';
import { jsonApiError } from '../errors/json-api-error';
import { isRecord, ownMember } from '../internal/object';
import { quotable } from '../internal/quotable';
import { invalidDocument } from '../request/identifiers';
import { parseResourceObject } from '../request/resource-document';

/** A result object: `data` when the handler returned a row, else empty. */
export interface OperationResult {
  readonly data?: ResourceObject;
}

export interface Execution<TTransaction, TContext> {
  readonly handlers: ReadonlyMap<
    string,
    AnyResourceHandlers<TTransaction, TContext>
  >;
  readonly lids: Lids;
  readonly context: OperationContext<TTransaction, TContext>;
}

export function forbidden(pointer: string, detail: string): BanError {
  return jsonApiError('FORBIDDEN', { detail, source: { pointer } });
}

export function handlersFor<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  type: string,
  pointer: string,
): AnyResourceHandlers<TTransaction, TContext> {
  const handlers = execution.handlers.get(type);
  if (handlers === undefined) {
    throw jsonApiError('NOT_FOUND', {
      detail: quotable(type)
        ? `No resource type "${type}" exists`
        : 'No resource type by this name exists',
      source: { pointer },
    });
  }
  return handlers;
}

/**
 * Where the request holds the target's `member`, or the target itself:
 * under `ref`, or at `href`, the one string the resolver read every
 * member from.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors ("a pointer to the source of the problem in the request document")
 */
export function targetPointer(
  operation: RawOperation,
  member?: keyof OperationTarget,
): string {
  if (operation.targetMember === 'href') {
    return `${operation.pointer}/href`;
  }
  return member === undefined
    ? `${operation.pointer}/ref`
    : `${operation.pointer}/ref/${member}`;
}

/** The id of the resource `target`, `operation`'s, names, resolving a `lid` from an earlier `add`. */
export function targetId<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  operation: RawOperation,
  target: OperationTarget,
): string {
  if (target.id !== undefined) {
    return target.id;
  }
  if (target.lid !== undefined) {
    return execution.lids.resolve(
      target.type,
      target.lid,
      targetPointer(operation, 'lid'),
    );
  }
  throw jsonApiError(
    invalidDocument(
      targetPointer(operation),
      'The target must name a resource by id or lid',
    ),
  );
}

export function requireData(operation: RawOperation, what: string): unknown {
  if (!operation.hasData) {
    throw jsonApiError(
      invalidDocument(
        operation.pointer,
        `An operation that ${what} must have a data member`,
      ),
    );
  }
  return operation.data;
}

/** The resource object of `data`, parsed and with local ids resolved. */
export async function parseData<TTransaction, TContext>(
  execution: Execution<TTransaction, TContext>,
  resource: AnyResource,
  operation: RawOperation,
  kind: 'create' | 'update',
  id?: string,
): Promise<ResolvedResourceObject<unknown>> {
  const pointer = `${operation.pointer}/data`;
  const parsed = await parseResourceObject(
    resource,
    requireData(operation, `${kind}s a resource`),
    { operation: kind, id, lids: true, pointer },
  );
  const relationships: Record<string, ResourceLinkage> = {};
  for (const [name, linkage] of Object.entries(parsed.relationships)) {
    relationships[name] = execution.lids.linkage(
      linkage,
      `${pointer}/relationships/${name}/data`,
    );
  }
  return { ...parsed, relationships };
}

export function resultOf(resource: AnyResource, row: unknown): OperationResult {
  return row === undefined ? {} : { data: serializeResource(resource, row) };
}

/** The `type` of `data` when an `add` has no collection target. */
export function dataType(operation: RawOperation): string {
  const data = requireData(operation, 'adds a resource');
  const type = isRecord(data) ? ownMember(data, 'type') : undefined;
  if (typeof type !== 'string') {
    throw jsonApiError(
      invalidDocument(
        `${operation.pointer}/data/type`,
        'A resource object must have a string type',
      ),
    );
  }
  return type;
}
