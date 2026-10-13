/**
 * A structural copy of the Standard Schema V1 interface, as the other
 * `@nizam-os` packages vendor theirs, so the declaration files never depend
 * on `@standard-schema/spec`. Any object that satisfies it satisfies the
 * published interface, which TanStack Form takes as a form's validator.
 * @ref https://standardschema.dev
 * @ref https://github.com/standard-schema/standard-schema/blob/main/packages/spec/src/index.ts
 * @packageDocumentation
 */

/** An issue: its message, and the path of the value it is about; none for the whole input. */
export interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey> | undefined;
}

/** A successful result: the output, and no issues. */
interface StandardSuccess<TOutput> {
  readonly value: TOutput;
  readonly issues?: undefined;
}

/** A failed result: the issues. */
interface StandardFailure {
  readonly issues: ReadonlyArray<StandardIssue>;
}

/** The input and output types, carried for inference only. */
interface StandardTypes<TInput, TOutput> {
  readonly input: TInput;
  readonly output: TOutput;
}

/** A Standard Schema V1 whose `validate` is synchronous. */
export interface SyncStandardSchema<TInput, TOutput = TInput> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSuccess<TOutput> | StandardFailure;
    readonly types?: StandardTypes<TInput, TOutput> | undefined;
  };
}
