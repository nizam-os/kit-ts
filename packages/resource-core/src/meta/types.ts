/**
 * The field metadata of a declared resource (SPEC 8): what each public
 * field and relationship accepts, for forms, documentation, and clients.
 * It is read from the specs the schemas are built from, so a client that
 * follows the metadata sends what the schemas accept.
 * @packageDocumentation
 */
import type { Operator } from '@nizam-os/keyset-core';

import type { Access } from '../declare/types';

/** The JSON type a value travels as (SPEC 5.1); `any` for a JSON column or a codec, whose schema decides. */
export type WireType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'array'
  | 'any';

/**
 * A value's bounds, folded into the tightest value per JSON Schema keyword
 * (SPEC 6.1); `null` where none applies. Numeric bounds are decimal strings
 * whatever the wire type, since `int8` and `numeric` values exceed
 * JavaScript's numbers. At most one of `minimum` and `exclusiveMinimum` is
 * set, and at most one of `maximum` and `exclusiveMaximum`.
 * @ref https://json-schema.org/draft/2020-12/json-schema-validation#section-6.2
 * @ref https://json-schema.org/draft/2020-12/json-schema-validation#section-6.3
 */
export interface FieldLimits {
  /** The fewest code points a string holds. */
  readonly minLength: number | null;
  /** The most code points a string holds. */
  readonly maxLength: number | null;
  readonly minimum: string | null;
  readonly exclusiveMinimum: string | null;
  readonly maximum: string | null;
  readonly exclusiveMaximum: string | null;
  /** The step of `numeric(p, s)`: `10^-s`. */
  readonly multipleOf: string | null;
  /**
   * Patterns a string must each contain a match of, as JavaScript sources
   * read with the flags `su` (catalog SPEC 8.4). JSON Schema's `pattern`
   * holds one; several join under `allOf`.
   */
  readonly patterns: ReadonlyArray<string>;
}

/** What an array's elements take (SPEC 5.1): an element is never an array, a JSON value, or `null`. */
export interface ItemMeta<
  TOptions extends ReadonlyArray<string> | null = ReadonlyArray<string> | null,
> {
  readonly wire: Exclude<WireType, 'array' | 'any'>;
  readonly format: string | null;
  readonly fractionDigits: number | null;
  readonly limits: FieldLimits;
  readonly options: TOptions;
}

/**
 * The members of `FieldMeta` a declaration's types know: literal for a
 * resource declared over a table of a typed catalog, as wide as below
 * otherwise.
 */
export interface FieldFacts {
  readonly name: string;
  readonly column: string;
  readonly kind: 'attribute' | 'relationship';
  readonly access: Access;
  readonly nullable: boolean;
  readonly required: boolean;
  readonly options: ReadonlyArray<string> | null;
  readonly items: ItemMeta | null;
  readonly target: string | null;
  readonly filter: ReadonlyArray<Operator>;
  readonly sortable: boolean;
  readonly codec: string | null;
}

/**
 * A member's default (SPEC 8), for display: a client never sends it, and
 * the database decides the value.
 */
export interface FieldDefault {
  /** The constant's text as PostgreSQL prints it; `null` for an expression such as `now()`. */
  readonly literal: string | null;
  /**
   * The constant's read form (SPEC 5.1), the value as a read gives it
   * before the column's type modifier applies, and a relationship's as
   * its id's text; `undefined` for an expression, a codec's field, and a
   * constant outside the read form.
   */
  readonly value: unknown;
}

/** One public field or relationship of a declared resource (SPEC 8). */
export interface FieldMeta<TFacts extends FieldFacts = FieldFacts> {
  /** The public name, the key of `fields`. */
  readonly name: TFacts['name'];
  readonly column: TFacts['column'];
  readonly kind: TFacts['kind'];
  readonly access: TFacts['access'];
  /** The JSON type of the value; a relationship's value is its id, a string (SPEC 3.4). */
  readonly wire: WireType;
  /** The value's OpenAPI format, or `null`; an id names its key's (SPEC 3.4). */
  readonly format: string | null;
  /** A date-time's fraction digits of a second: p of `timestamp(p)`, six without one. */
  readonly fractionDigits: number | null;
  /** Whether the value may be `null` (SPEC 6.1 step 4). */
  readonly nullable: TFacts['nullable'];
  /** Whether a create must carry the member: `schema.create` or `linkage.create` requires it (SPEC 6.2). */
  readonly required: TFacts['required'];
  /** The default PostgreSQL applies when a create leaves the member out; `null` without one. */
  readonly default: FieldDefault | null;
  readonly limits: FieldLimits;
  /** Enum labels or an `enum` rule's values, in order; `null` when any value of the type goes. */
  readonly options: TFacts['options'];
  /** What an array's elements take; `null` for any other value. */
  readonly items: TFacts['items'];
  /** A relationship's target type; `null` for an attribute. */
  readonly target: TFacts['target'];
  /** The operators clients may filter by (SPEC 11.3). */
  readonly filter: TFacts['filter'];
  /** Whether clients may sort by the member. */
  readonly sortable: TFacts['sortable'];
  /** The codec that owns the representation (SPEC 7.1); its schema describes the value. */
  readonly codec: TFacts['codec'];
  readonly description: string | null;
  /** The declared example, which the field's schema accepts; `undefined` when none is declared. */
  readonly example: unknown;
}
