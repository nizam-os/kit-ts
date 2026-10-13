/**
 * The tables of the NOT ENFORCED catalog (`../unenforced.ts`), as
 * `@nizam-os/pg-catalog` extracts them on PostgreSQL 18, except two rules
 * written by hand: `imported_contacts_nickname_check` carries `notNull` and
 * `imported_contacts_status_check` the `enum` rule its expression states.
 * The extractor never writes a rule for a NOT ENFORCED CHECK (catalog ADR
 * 0006); the two prove that resource-core ignores a rule on a constraint
 * the database does not apply, whoever wrote the catalog. Not published
 * with the package.
 * @packageDocumentation
 */

export const IMPORTED_CONTACTS_TABLE = {
  schema: 'public',
  name: 'imported_contacts',
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
    name: {
      type: 'text',
      typeKind: 'base',
      array: false,
      sqlType: 'text',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: false,
      default: null,
      identity: null,
      generated: null,
    },
    nickname: {
      type: 'text',
      typeKind: 'base',
      array: false,
      sqlType: 'text',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: true,
      default: null,
      identity: null,
      generated: null,
    },
    email: {
      type: 'text',
      typeKind: 'base',
      array: false,
      sqlType: 'text',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: true,
      default: null,
      identity: null,
      generated: null,
    },
    status: {
      type: 'text',
      typeKind: 'base',
      array: false,
      sqlType: 'text',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: true,
      default: null,
      identity: null,
      generated: null,
    },
    score: {
      type: 'int4',
      typeKind: 'base',
      array: false,
      sqlType: 'integer',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: true,
      default: null,
      identity: null,
      generated: null,
    },
    owner_id: {
      type: 'uuid',
      typeKind: 'base',
      array: false,
      sqlType: 'uuid',
      maxLength: null,
      precision: null,
      scale: null,
      nullable: true,
      default: null,
      identity: null,
      generated: null,
    },
  },
  constraints: {
    imported_contacts_email_check: {
      kind: 'check',
      columns: ['email'],
      rule: null,
      enforced: false,
    },
    imported_contacts_nickname_check: {
      kind: 'check',
      columns: ['nickname'],
      rule: {
        kind: 'notNull',
      },
      enforced: false,
    },
    imported_contacts_owner_id_fkey: {
      kind: 'foreignKey',
      columns: ['owner_id'],
      references: {
        table: 'owners',
        columns: ['id'],
      },
      enforced: false,
    },
    imported_contacts_pkey: {
      kind: 'primaryKey',
      columns: ['id'],
    },
    imported_contacts_reachable_check: {
      kind: 'check',
      columns: ['email', 'owner_id'],
      rule: null,
      enforced: false,
    },
    imported_contacts_score_check: {
      kind: 'check',
      columns: ['score'],
      rule: {
        kind: 'range',
        min: {
          value: '0',
          inclusive: true,
        },
        max: {
          value: '100',
          inclusive: true,
        },
      },
      enforced: true,
    },
    imported_contacts_status_check: {
      kind: 'check',
      columns: ['status'],
      rule: {
        kind: 'enum',
        values: ['active', 'archived'],
      },
      enforced: false,
    },
  },
} as const;

export const OWNERS_TABLE = {
  schema: 'public',
  name: 'owners',
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
    owners_pkey: {
      kind: 'primaryKey',
      columns: ['id'],
    },
  },
} as const;
