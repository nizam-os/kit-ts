/**
 * The names catalog (SPEC 4, 15.1): tables whose names fail the checks of
 * SPEC 4.2, as the `extract` command of `@nizam-os/pg-catalog` writes them
 * for this schema replayed on PGlite, typed by an explicit interface as
 * `contacts.ts` is.
 * `notes` holds a `type`, `lid`, and `constructor` column, a foreign key
 * without `_id` (`author`), two pairs of members that derive one name
 * (`contact` and `contact_id`, `body_text` and `bodyText`), names JSON:API
 * refuses (`_tmp`, `price$`), a cased letter outside the Basic Multilingual
 * Plane after `_` (`x_𐐨`), a CHECK whose code is not A-Z
 * (`notes_größe_check`), and two CHECKs that derive one code. `addresses`
 * holds pairs that derive one name through `_` before a digit, `__`, and
 * `ß` after `_`, `type_`, whose name is `type`, `suite-`, whose name ends in
 * `-`, and `constructor_id`, whose relationship name is `constructor`. Not
 * published with the package.
 *
 * ```sql
 * create table notes (
 *   id uuid primary key,
 *   type text not null check (type in ('call', 'email')),
 *   author uuid references notes (id),
 *   contact text,
 *   contact_id uuid references notes (id),
 *   "größe" integer check ("größe" > 0),
 *   body_text text,
 *   "bodyText" text,
 *   "_tmp" text,
 *   "price$" numeric,
 *   "constructor" text,
 *   lid text,
 *   "x_𐐨" text,
 *   created_at timestamptz not null default now(),
 *   constraint "Notes_body_check" check (body_text <> ''),
 *   constraint notes_body_check check (char_length(body_text) < 1000)
 * );
 *
 * create table "legacy$notes" (id uuid primary key);
 *
 * create table "constructor" (id uuid primary key);
 *
 * create table addresses (
 *   id uuid primary key,
 *   line_1 text,
 *   line1 text,
 *   street__name text,
 *   street_name text,
 *   type_ text,
 *   "suite-" text,
 *   "a_ß" text,
 *   a_s_s text,
 *   constructor_id uuid references addresses (id)
 * );
 * ```
 * @packageDocumentation
 */
import { ADDRESSES_TABLE } from './catalog/addresses-table';
import { NOTES_TABLE } from './catalog/notes-table';
import {
  CONSTRUCTOR_TABLE,
  LEGACY_NOTES_TABLE,
} from './catalog/type-name-tables';

export interface NamesCatalog {
  readonly format: 3;
  readonly enums: Readonly<Record<string, never>>;
  readonly domains: Readonly<Record<string, never>>;
  readonly tables: {
    readonly addresses: typeof ADDRESSES_TABLE;
    readonly constructor: typeof CONSTRUCTOR_TABLE;
    readonly legacy$notes: typeof LEGACY_NOTES_TABLE;
    readonly notes: typeof NOTES_TABLE;
  };
}

export const namesCatalog: NamesCatalog = {
  format: 3,
  enums: {},
  domains: {},
  tables: {
    addresses: ADDRESSES_TABLE,
    constructor: CONSTRUCTOR_TABLE,
    legacy$notes: LEGACY_NOTES_TABLE,
    notes: NOTES_TABLE,
  },
};
