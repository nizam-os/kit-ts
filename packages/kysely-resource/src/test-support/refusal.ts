/**
 * What an operation rejected with, as a client receives it: the
 * `BanError`, its status, and the JSON:API error objects
 * `@nizam-os/jsonapi-core` renders of it.
 */
import type { BanError } from '@nizam-os/ban-core';
import type { ErrorObject } from '@nizam-os/jsonapi-core';

import { errorObjects, isBanError } from '@nizam-os/jsonapi-core';

/** A refusal: the error and the objects a client receives. */
export interface Refusal {
  readonly error: BanError;
  readonly status: number;
  readonly objects: ReadonlyArray<ErrorObject>;
}

/** The refusal `operation` rejects with; throws when it resolves or rejects with anything but a `BanError`. */
export async function refusal(operation: Promise<unknown>): Promise<Refusal> {
  const thrown = await operation.then(
    () => {
      throw new Error('the operation succeeded');
    },
    (error: unknown) => error,
  );
  if (!isBanError(thrown)) {
    throw new Error('the operation rejected with something else', {
      cause: thrown,
    });
  }
  return {
    error: thrown,
    status: thrown.status,
    objects: errorObjects(thrown),
  };
}
