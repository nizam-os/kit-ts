/**
 * The domain calls of one operations request (resource SPEC 19.4). A
 * refusal a call throws is the client's error already: it moves to the
 * operation at once, before the processor sees it. Anything else ends
 * the transaction as thrown, and `transaction` maps it once the
 * transaction ended (SPEC 12.10, 18.5), outside the processor, so the
 * calls keep the index of the operation whose call threw it, and where
 * its input sits, and move the mapped error there.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors ("each with a source member that contains a pointer to the source of the problem in the request document")
 * @packageDocumentation
 */
import type { Move } from './pointers';

import { isBanError } from '@nizam-os/hono-jsonapi';
import { errorAtOperation } from '@nizam-os/hono-jsonapi/atomic';

import { movedError } from './pointers';

/** The operation whose call threw what is not the client's error yet, and where its input sits. */
interface Unmapped {
  readonly index: number;
  readonly move: Move;
}

/** The pointer of operation `index`. */
function operationPointer(index: number): string {
  return `/atomic:operations/${String(index)}`;
}

/** The calls of one request, in the transaction of its operations. */
export class OperationCalls {
  #unmapped: Unmapped | undefined;

  /**
   * Runs operation `index`'s domain call, whose input sits where `move`
   * puts a path into `/data`. A `BanError` it throws rejects moved;
   * anything else rejects as thrown, kept for `settled`.
   */
  public async run<TResult>(
    index: number,
    move: Move,
    call: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await call();
    } catch (thrown) {
      if (isBanError(thrown)) {
        throw movedError(thrown, move);
      }
      this.#unmapped ??= { index, move };
      throw thrown;
    }
  }

  /**
   * What the request answers for `error`, which `transaction` rejected
   * with: a `BanError` it mapped from what a call threw, moved to that
   * call's operation; anything else as it is.
   */
  public settled(error: unknown): unknown {
    const unmapped = this.#unmapped;
    if (unmapped === undefined || !isBanError(error)) {
      return error;
    }
    return errorAtOperation(
      movedError(error, unmapped.move),
      operationPointer(unmapped.index),
    );
  }
}
