/**
 * `reject(code, { fields, detail })` (SPEC 12.4): how a rule refuses an
 * operation for a reason only outside state knows, such as a reference to
 * check before a remove or a limit a service holds. It throws a
 * `Rejection` carrying one of the application's codes, and
 * `rejectionError` turns that into the code's error, with one item per
 * named member under the operation's pointer, so every runtime answers
 * alike. A rule receives `reject` in its context, typed by the domain's
 * codes and the resource's public members (`createDomainDefiners`); the
 * function is this one.
 * @packageDocumentation
 */
import type { Catalog, ErrorDefinition } from '@nizam-os/ban-core';

import type {
  AnyDeclaredResource,
  DeclaredInternals,
} from '../declare/declared-resource';

import { BanError, resolveDefinition } from '@nizam-os/ban-core';

import { internalsOf } from '../declare/declared-resource';
import { isRecord, ownValue } from '../internal/object';
import { isErrorDefinition } from '../registry/check-registry';
import { memberItems, memberTokens, pointerTokens } from './member-items';

/** What a rejection adds to its code. */
export interface RejectOptions<TMember extends string = string> {
  /** Public members of the resource the items point at; `id` is the resource id. */
  readonly fields?: ReadonlyArray<TMember> | undefined;
  /** A constant detail, never request data; the code's own text when absent. */
  readonly detail?: string | undefined;
}

/** `reject` as a rule's context types it: the domain's codes and the resource's members. */
export type Reject<TCode extends string, TMember extends string> = (
  code: TCode,
  options?: RejectOptions<TMember>,
) => never;

/** A rule's refusal: an application code, the members it concerns, and a constant detail. */
export class Rejection extends Error {
  public override readonly name: string = 'Rejection';
  public readonly code: string;
  public readonly fields: ReadonlyArray<string>;
  public readonly detail: string | undefined;

  public constructor(code: string, options: RejectOptions = {}) {
    super(`Rejected with ${code}`);
    this.code = code;
    this.fields = Object.freeze([...(options.fields ?? [])]);
    this.detail = options.detail;
  }
}

function checkReject(code: unknown, options: unknown): RejectOptions {
  if (typeof code !== 'string') {
    throw new TypeError('reject: the code must be a string');
  }
  if (options === undefined) {
    return {};
  }
  const fields = isRecord(options) ? (options['fields'] ?? []) : undefined;
  const detail = isRecord(options) ? options['detail'] : undefined;
  if (
    !Array.isArray(fields) ||
    !fields.every((field) => typeof field === 'string') ||
    (detail !== undefined && typeof detail !== 'string')
  ) {
    throw new TypeError(
      'reject: options must be { fields?: string[], detail?: string }',
    );
  }
  return { fields, detail };
}

/** Throws a `Rejection` with `code`, the members it concerns, and a constant detail. */
export function reject(code: string, options?: RejectOptions): never {
  throw new Rejection(code, checkReject(code, options));
}

/** Where `rejectionError` looks up the code and points the items. */
export interface RejectionErrorOptions {
  /** The declared resource the operation runs on. */
  readonly resource: AnyDeclaredResource;
  /** A catalog holding the code: the application's errors, or the ban's whole catalog. */
  readonly errors: Catalog;
  /** The RFC 6901 pointer of the operation's resource object; default `/data`. */
  readonly pointer?: string | undefined;
}

interface Target {
  readonly internals: DeclaredInternals;
  readonly definition: ErrorDefinition;
  readonly base: ReadonlyArray<string>;
}

function targetOf(code: string, options: unknown): Target {
  const value = isRecord(options) ? options : {};
  const internals = internalsOf(value['resource']);
  if (internals === undefined) {
    throw new TypeError(
      'rejectionError: options.resource must be a resource declareResource returned',
    );
  }
  const errors = value['errors'];
  const definition = isRecord(errors) ? ownValue(errors, code) : undefined;
  if (!isErrorDefinition(definition)) {
    throw new TypeError(`rejectionError: options.errors has no code ${code}`);
  }
  const pointer = value['pointer'] ?? '/data';
  const base = typeof pointer === 'string' ? pointerTokens(pointer) : undefined;
  if (base === undefined) {
    throw new TypeError(
      'rejectionError: options.pointer must be an RFC 6901 JSON Pointer',
    );
  }
  return { internals, definition, base };
}

/**
 * The error of `rejection`: its code's status, title, and type from
 * `options.errors`, its detail, one item per named member under
 * `options.pointer`, and the rejection as the cause; what `ban.error(code)`
 * builds, so a handler renders both alike. Throws `TypeError` for a code
 * the catalog lacks, a member the resource lacks, or an invalid pointer.
 */
export function rejectionError(
  rejection: Rejection,
  options: RejectionErrorOptions,
): BanError {
  const { internals, definition, base } = targetOf(rejection.code, options);
  const { names } = internals.resource;
  const paths = rejection.fields.map((member) => {
    const tokens = memberTokens(names, member);
    if (tokens === undefined) {
      throw new TypeError(
        `rejectionError: ${rejection.code} names "${member}", which ${names.type} has no member called`,
      );
    }
    return tokens;
  });
  const resolved = resolveDefinition(rejection.code, definition);
  return new BanError({
    status: resolved.status,
    code: resolved.code,
    title: resolved.title,
    type: resolved.type,
    definition: resolved,
    detail: rejection.detail,
    errors: memberItems(base, paths, rejection.detail ?? resolved.title),
    cause: rejection,
  });
}
