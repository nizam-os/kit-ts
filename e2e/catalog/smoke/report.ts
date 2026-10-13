/**
 * Collects named checks and reports them, so one run lists every failure.
 * Shared by the runtime-neutral checks and the extraction checks.
 */
export interface SmokeResult {
  readonly runtime: string;
  readonly passed: number;
  readonly failures: ReadonlyArray<string>;
}

export type Checks = Readonly<Record<string, () => void | Promise<void>>>;

class CheckFailure extends Error {
  override readonly name: string = 'CheckFailure';
}

export function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new CheckFailure(message);
  }
}

/** Compares JSON data by its serialization, which the catalog's member order makes exact. */
export function sameJson(
  actual: unknown,
  expected: unknown,
  what: string,
): void {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${what}: the values differ`,
  );
}

export async function runChecks(
  runtime: string,
  checks: Checks,
): Promise<SmokeResult> {
  const failures: Array<string> = [];
  let passed = 0;
  for (const [name, run] of Object.entries(checks)) {
    try {
      await run();
      passed += 1;
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { runtime, passed, failures };
}

/** Prints the outcome; throws on failure so the process exits non-zero everywhere. */
export function report(result: SmokeResult): void {
  const total = result.passed + result.failures.length;
  if (result.failures.length === 0) {
    console.log(
      `@nizam-os/catalog smoke: ${total} checks passed on ${result.runtime}`,
    );
    return;
  }
  for (const failure of result.failures) {
    console.error(`FAIL ${failure}`);
  }
  throw new Error(
    `@nizam-os/catalog smoke: ${result.failures.length} of ${total} checks failed on ${result.runtime}`,
  );
}
