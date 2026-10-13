/**
 * Tables of the names catalog (`../names.ts`) whose names cannot be a
 * resource type, as `@nizam-os/pg-catalog` extracts them. Not published with
 * the package.
 * @packageDocumentation
 */

/** Not a JSON:API member name: `$` is reserved. */
export const LEGACY_NOTES_TABLE = {
  schema: 'public',
  name: 'legacy$notes',
  primaryKey: ['id'],
  columns: {
    id: {
      type: 'uuid',
      typeKind: 'base',
      array: false,
      sqlType: 'uuid',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
  },
  constraints: {
    legacy$notes_pkey: {
      kind: 'primaryKey',
      columns: ['id'],
    },
  },
} as const;

/** A member of `Object.prototype`. */
export const CONSTRUCTOR_TABLE = {
  schema: 'public',
  name: 'constructor',
  primaryKey: ['id'],
  columns: {
    id: {
      type: 'uuid',
      typeKind: 'base',
      array: false,
      sqlType: 'uuid',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
  },
  constraints: {
    constructor_pkey: {
      kind: 'primaryKey',
      columns: ['id'],
    },
  },
} as const;
