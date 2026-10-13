/**
 * The object schemas as Standard Schema V1 validators (SPEC 6.5), what a
 * `@nizam-os/jsonapi-core` definition validates attributes with: `validate`
 * runs the schema synchronously and reports `ResourceIssue`s, never Zod's
 * own issues. The schema runs with `reportInput`, which the issue mapping
 * needs to tell a missing member and `null` from a wrong type; the input
 * never reaches an issue.
 * @ref https://standardschema.dev
 * @ref https://zod.dev/error-customization#include-input-in-issues
 * @packageDocumentation
 */
import type { z } from 'zod/v4';

import type { SyncStandardSchema } from '../internal/standard-schema';
import type { FindMember, ResourceIssue } from './issues';

import { toResourceIssues } from './issues';

/** The vendor of the validators resource-core makes. */
const VENDOR = 'nizam';

/** A synchronous Standard Schema V1 validator whose issues are `ResourceIssue`s. */
export type ResourceValidator<
  TInput = unknown,
  TOutput = TInput,
> = SyncStandardSchema<TInput, TOutput, ResourceIssue>;

/** `schema` as a Standard Schema V1 validator; `findMember` reads the members of its issue paths. */
export function standardValidator<TOutput>(
  schema: z.ZodType<TOutput>,
  findMember: FindMember,
): ResourceValidator<unknown, TOutput> {
  return Object.freeze({
    '~standard': Object.freeze({
      version: 1,
      vendor: VENDOR,
      validate: (value: unknown) => {
        const result = schema.safeParse(value, { reportInput: true });
        return result.success
          ? { value: result.data }
          : { issues: toResourceIssues(result.error.issues, findMember) };
      },
    }),
  });
}
