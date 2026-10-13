/**
 * The error of a derived code (SPEC 9.1): the code's status and title, its
 * constraint kind's constant detail, and one item per member of the code's
 * `fields` under the operation's resource object. `constraintError` makes
 * it for a violation PostgreSQL raised, with the driver error as `cause`;
 * `relationshipTargets` makes the foreign key's for a target the runtime
 * did not find, so both answer alike.
 * @packageDocumentation
 */
import type { DeclaredResource } from '../declare/declared-resource';
import type { ErrorEntry } from '../errors/error-entry';

import { BanError } from '@nizam-os/ban-core';

import { KIND_DETAIL } from '../errors/error-entry';
import { memberItems, memberTokens } from './member-items';

/** The error of `code`, whose entry is `entry`, with its items under `base` and `cause` as its cause. */
export function codeError(
  resource: DeclaredResource,
  code: string,
  entry: ErrorEntry,
  base: ReadonlyArray<string>,
  cause?: unknown,
): BanError {
  const detail = KIND_DETAIL[entry.kind];
  const paths = entry.fields.flatMap((member) => {
    const tokens = memberTokens(resource.names, member);
    return tokens === undefined ? [] : [tokens];
  });
  return new BanError({
    status: entry.status,
    code,
    title: entry.title,
    detail,
    errors: memberItems(base, paths, detail),
    cause,
  });
}
