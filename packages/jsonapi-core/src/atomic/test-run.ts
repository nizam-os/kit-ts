/**
 * Runs an operations list through a processor and reports the outcome the
 * way an HTTP adapter would answer it. Not published.
 */
import type { ErrorObject } from '../document/types';
import type { OperationResult } from './execute';
import type { OperationsProcessor, OperationsResultDocument } from './process';
import type { Caller, Store } from './test-fixtures';
import type { AtomicOptions } from './types';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { CALLER, createProcessor } from './test-fixtures';

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;

/** What an HTTP adapter would answer with. */
export interface Outcome {
  readonly status: number;
  /** Every result, in operation order; empty on failure. */
  readonly results: ReadonlyArray<OperationResult>;
  /** The results document of a 200; absent for a 204 and for failures. */
  readonly document: OperationsResultDocument | undefined;
  /** The error objects of a failure. */
  readonly errors: ReadonlyArray<ErrorObject>;
}

/** Runs `operations` through `process` and reports the outcome. */
export async function run(
  process: OperationsProcessor<Caller>,
  operations: ReadonlyArray<unknown>,
  ctx: Caller = CALLER,
): Promise<Outcome> {
  try {
    const { results, document } = await process(
      { 'atomic:operations': operations },
      ctx,
    );
    return {
      status: document === undefined ? HTTP_NO_CONTENT : HTTP_OK,
      results,
      document,
      errors: [],
    };
  } catch (error) {
    if (isBanError(error)) {
      return {
        status: error.status,
        results: [],
        document: undefined,
        errors: errorObjects(error),
      };
    }
    throw error;
  }
}

/** The status and first error object of a request that must fail. */
export async function failure(
  store: Store,
  operations: ReadonlyArray<unknown>,
  overrides?: Partial<AtomicOptions<Store, Caller>>,
): Promise<{ status: number; error: ErrorObject }> {
  const { status, errors } = await run(
    createProcessor(store, overrides),
    operations,
  );
  const error = errors[0];
  if (error === undefined) {
    throw new Error('expected an error object');
  }
  return { status, error };
}
