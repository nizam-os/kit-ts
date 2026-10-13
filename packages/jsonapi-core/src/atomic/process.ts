/**
 * `operationsProcessor()` (SPEC 11.1): the framework-free core of an
 * operations endpoint. The host (an HTTP adapter such as `@nizam-os/hono-jsonapi`)
 * checks the method and the `Content-Type`, reads the JSON body, and hands
 * it here; the processor parses the document, runs every operation in
 * order inside the caller's transaction, and returns the results together
 * with the response document, or no document when `204 No Content` applies.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @packageDocumentation
 */
import type { ExtensionDocument, JsonApiObject } from '../document/types';
import type { OperationResult } from './execute';
import type { AnyResourceHandlers, AtomicOptions } from './types';

import { isBanError } from '@nizam-os/ban-core';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  DEFAULT_MAX_OPERATIONS,
  JSON_API_VERSION,
} from '../internal/constants';
import { executeOperation } from './execute';
import { Lids } from './lids';
import { errorAtOperation } from './operation-error';
import { RESULTS_MEMBER, parseOperationsDocument } from './parse-document';

/** The response document: results in operation order, extension applied. */
export interface OperationsResultDocument extends ExtensionDocument {
  readonly jsonapi: JsonApiObject;
  readonly [RESULTS_MEMBER]: ReadonlyArray<OperationResult>;
}

/** What processing an operations document produces. */
export interface OperationsOutcome {
  /** One result object per operation, in operation order. */
  readonly results: ReadonlyArray<OperationResult>;
  /**
   * The document to send with `200`, or `undefined` when no operation
   * returned `data`: the extension then allows `204 No Content` and no
   * document ("if all results are empty, the server MAY respond with 204").
   */
  readonly document: OperationsResultDocument | undefined;
}

/**
 * Parses an operations document (the request body as JSON) and runs it
 * inside one transaction. Rejects with the `BanError` to render (a 400
 * for the document, the failing operation's error with its pointer added)
 * or with whatever else a handler threw, after the transaction rolled back.
 */
export type OperationsProcessor<TContext = unknown> = (
  body: unknown,
  ctx: TContext,
) => Promise<OperationsOutcome>;

function indexHandlers<TTransaction, TContext>(
  resources: ReadonlyArray<AnyResourceHandlers<TTransaction, TContext>>,
): ReadonlyMap<string, AnyResourceHandlers<TTransaction, TContext>> {
  const handlers = new Map<
    string,
    AnyResourceHandlers<TTransaction, TContext>
  >();
  for (const entry of resources) {
    if (handlers.has(entry.resource.type)) {
      throw new TypeError(
        `operationsProcessor: resource type "${entry.resource.type}" is listed twice`,
      );
    }
    handlers.set(entry.resource.type, entry);
  }
  return handlers;
}

/**
 * The cap the resources' definitions share (SPEC 11.1, ADR 0023): one
 * endpoint takes one, so definitions that differ are a `TypeError` here,
 * at setup; without resources, the default.
 */
function sharedCap<TTransaction, TContext>(
  resources: ReadonlyArray<AnyResourceHandlers<TTransaction, TContext>>,
): number {
  const caps = [
    ...new Set(resources.map((entry) => entry.resource.atomic.max)),
  ];
  if (caps.length > 1) {
    throw new TypeError(
      `operationsProcessor: the resources' definitions have different atomic.max (${caps.join(', ')}); one endpoint takes one cap`,
    );
  }
  return caps[0] ?? DEFAULT_MAX_OPERATIONS;
}

function resultsDocument(
  results: ReadonlyArray<OperationResult>,
): OperationsResultDocument | undefined {
  if (results.every((result) => result.data === undefined)) {
    return undefined;
  }
  return {
    jsonapi: { version: JSON_API_VERSION, ext: [ATOMIC_OPERATIONS_EXTENSION] },
    [RESULTS_MEMBER]: results,
  };
}

/**
 * Builds the processor for a set of resource handlers. Listing a resource
 * type twice, and definitions whose caps differ, are a `TypeError` here,
 * at setup, not per request.
 */
export function operationsProcessor<TTransaction, TContext = unknown>(
  options: AtomicOptions<TTransaction, TContext>,
): OperationsProcessor<TContext> {
  const handlers = indexHandlers(options.resources);
  const parseOptions = {
    maxOperations: sharedCap(options.resources),
    resolveHref: options.resolveHref,
  };
  return async (body, ctx) => {
    const operations = parseOperationsDocument(body, parseOptions);
    const results = await options.transaction(ctx, async (tx) => {
      const lids = new Lids();
      const out: Array<OperationResult> = [];
      for (const operation of operations) {
        const execution = {
          handlers,
          lids,
          context: {
            ctx,
            tx,
            index: operation.index,
            pointer: operation.pointer,
            meta: operation.meta,
          },
        };
        try {
          out.push(await executeOperation(execution, operation));
        } catch (error) {
          throw isBanError(error)
            ? errorAtOperation(error, operation.pointer)
            : error;
        }
      }
      return out;
    });
    return { results, document: resultsDocument(results) };
  };
}
