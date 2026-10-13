/**
 * `parseSurface(value)` (SPEC 13.2): a surface read back from JSON, such
 * as the snapshot an application commits, checked member by member, so a
 * snapshot of another format or a hand edit fails with the path of the
 * first problem instead of reaching `diffSurfaces`, which trusts its
 * input's shape.
 * @packageDocumentation
 */
import type { WireType } from '../meta/types';
import type { Surface } from './surface';

import { z } from 'zod/v4';

import { OPERATORS } from '@nizam-os/keyset-core';

import { OPERATIONS } from '../declare/check-options';
import {
  ACCESS_MODES,
  RELATIONSHIP_ACCESS,
  RELATIONSHIP_OPERATORS,
} from '../declare/check-shape';
import { describe, isRecord } from '../internal/object';
import { SURFACE_FORMAT } from './surface';

/** Every wire type, keyed by itself, so a new one fails to compile here until it is listed. */
const WIRES: { readonly [TWire in WireType]: TWire } = {
  string: 'string',
  integer: 'integer',
  number: 'number',
  boolean: 'boolean',
  array: 'array',
  any: 'any',
};

const count = z.number().int().nonnegative();
const decimal = z.string().nullable();

const limits = z.strictObject({
  minLength: count.nullable(),
  maxLength: count.nullable(),
  minimum: decimal,
  exclusiveMinimum: decimal,
  maximum: decimal,
  exclusiveMaximum: decimal,
  multipleOf: decimal,
  patterns: z.array(z.string()),
});

const valueMembers = {
  wire: z.enum(WIRES),
  format: z.string().nullable(),
  fractionDigits: count.nullable(),
  limits,
  options: z.array(z.string()).nullable(),
};

const field = z.strictObject({
  ...valueMembers,
  access: z.literal(ACCESS_MODES),
  nullable: z.boolean(),
  required: z.boolean(),
  items: z.strictObject(valueMembers).nullable(),
  codec: z.string().nullable(),
  operators: z.array(z.literal(OPERATORS)),
  sortable: z.boolean(),
});

const relationship = z.strictObject({
  target: z.string(),
  access: z.literal(RELATIONSHIP_ACCESS),
  nullable: z.boolean(),
  required: z.boolean(),
  operators: z.array(z.literal(RELATIONSHIP_OPERATORS)),
  include: z.boolean(),
});

const page = z.strictObject({
  default: count,
  max: count,
  range: z.boolean(),
});

const resource = z.strictObject({
  operations: z.array(z.literal(OPERATIONS)),
  fields: z.record(z.string(), field),
  relationships: z.record(z.string(), relationship),
  codes: z.record(z.string(), count),
  search: z.string().nullable(),
  page: page.nullable(),
});

const surface = z.strictObject({
  format: z.literal(SURFACE_FORMAT),
  resources: z.record(z.string(), resource),
});

/**
 * The surface `value` holds, as `surfaceOf` wrote it, or a `TypeError`
 * naming the first member that is not: a format other than
 * `SURFACE_FORMAT`, a missing or unknown member, or a value of the wrong
 * kind, such as an access no declaration takes.
 */
export function parseSurface(value: unknown): Surface {
  if (
    isRecord(value) &&
    Object.hasOwn(value, 'format') &&
    value['format'] !== SURFACE_FORMAT
  ) {
    throw new TypeError(
      `parseSurface.format: format ${describe(value['format'])} is not supported (expected ${String(SURFACE_FORMAT)})`,
    );
  }
  const result = surface.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const [issue] = result.error.issues;
  throw new TypeError(
    issue === undefined
      ? 'parseSurface: not a surface'
      : `${['parseSurface', ...issue.path.map(String)].join('.')}: ${issue.message}`,
  );
}
