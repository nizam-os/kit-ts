import type { ZodType } from 'zod';

/**
 * A small application for the rules tests (SPEC 10.3): migrations with a
 * CHECK of each kind the oracle tries, and the resources of
 * `@nizam-os/resource-core` declared over the public catalog extracted
 * from them, types erased. `teams.name` carries rules; `teams.code` a
 * table CHECK without one and the domain `handle` a domain CHECK without
 * one, each with its validator; `members` a CHECK over two members with
 * its validator; `teams.slots` an `int4range` behind a codec. Each
 * validator mirrors its CHECK: `strpos` finds a character in any locale.
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type { Codec, Validator } from '@nizam-os/resource-core';

import type { Migration } from '../migrations/load';

import { z } from 'zod';

import { toPublicCatalog } from '@nizam-os/catalog-core';
import {
  createDeclareResource,
  defineCodec,
  defineValidator,
} from '@nizam-os/resource-core';

import { extractCatalog } from '../commands/extract';

export const ORACLE_MIGRATIONS: ReadonlyArray<Migration> = [
  {
    name: 'V1__teams.sql',
    sql: `create domain handle as text
  constraint handle_check check (strpos(value, ' ') = 0);

create table teams (
  id integer generated always as identity primary key,
  name varchar(40) not null constraint teams_name_check check (char_length(name) >= 2),
  code text not null constraint teams_code_check check (strpos(code, '-') = 0),
  slots int4range
);

create table members (
  id integer generated always as identity primary key,
  team_id integer references teams (id),
  handle handle not null,
  note text,
  constraint members_team_or_note check (team_id is not null or note is not null)
);`,
  },
];

export const ORACLE_TABLES: ReadonlyArray<string> = ['members', 'teams'];

interface Slots {
  readonly from: number;
  readonly to: number;
}

interface TeamOrNote {
  readonly team: string | null;
  readonly note: string | null;
}

/** A storage codec over text, as `resources.storage` takes it. */
interface TextCodec<TValue> {
  readonly read: (stored: string) => TValue;
  readonly write: (value: TValue) => string;
}

const SLOTS = /^\[(-?\d+),(-?\d+)\)$/u;

export const slots: Codec<readonly ['int4range'], ZodType<Slots>> = defineCodec(
  {
    types: ['int4range'],
    schema: z
      .object({ from: z.number().int(), to: z.number().int() })
      .refine(({ from, to }) => from < to),
    fixtures: [
      { from: 1, to: 5 },
      { from: -3, to: 0 },
    ],
  },
);

/** The storage codec of `slots` over the text PostgreSQL prints: `[1,5)`. */
export const slotsText: TextCodec<Slots> = {
  read: (stored: string): Slots => {
    const match = SLOTS.exec(stored);
    if (match === null) {
      throw new TypeError(`not a range of slots: ${stored}`);
    }
    return { from: Number(match[1]), to: Number(match[2]) };
  },
  write: ({ from, to }: Slots): string => `[${from},${to})`,
};

export const VALIDATORS: {
  readonly noHyphen: Validator<ZodType<string, string>>;
  readonly noSpace: Validator<ZodType<string | null, string | null>>;
  readonly teamOrNote: Validator<ZodType<TeamOrNote, TeamOrNote>>;
} = {
  noHyphen: defineValidator({
    schema: z.string().refine((code) => !code.includes('-')),
    fixtures: { accept: ['ab', 'a_b'], reject: ['a-b'] },
  }),
  noSpace: defineValidator({
    schema: z
      .string()
      .refine((handle) => !handle.includes(' '))
      .nullable(),
    fixtures: { accept: ['ada', null], reject: ['a da'] },
  }),
  teamOrNote: defineValidator({
    schema: z
      .object({ team: z.string().nullable(), note: z.string().nullable() })
      .refine(({ team, note }) => team !== null || note !== null),
    fixtures: {
      accept: [
        { team: '1', note: null },
        { team: null, note: 'lobby' },
      ],
      reject: [{ team: null, note: null }],
    },
  }),
};

type Declare = (table: string, declaration: object) => object;

/** What a test replaces in the registry. */
export interface RegistryEdits {
  /** Entries of the validator registry, for the faults the rules tests plant. */
  readonly validators?: object;
  /** Entries of the codec registry, likewise. */
  readonly codecs?: object;
  /** Fields of `teams`, for the changes the surface tests make. */
  readonly teamFields?: object | undefined;
}

/** The resources over `catalog`, with `replaced`'s edits. */
export function oracleRegistry(
  catalog: PublicCatalog,
  replaced: RegistryEdits = {},
): ReadonlyArray<object> {
  const configure = createDeclareResource as unknown as (
    config: unknown,
  ) => Declare;
  const declare = configure({
    catalog,
    codecs: { slots, ...replaced.codecs },
    validators: { ...VALIDATORS, ...replaced.validators },
    domains: { handle: { handle_check: { validator: 'noSpace' } } },
  });
  const teams = declare('teams', {
    operations: ['get', 'create', 'update'],
    fields: {
      name: { access: 'readWrite' },
      code: { access: 'readWrite' },
      slots: { access: 'readWrite', codec: 'slots' },
      ...replaced.teamFields,
    },
    rules: { teams_code_check: { validator: 'noHyphen' } },
  });
  const members = declare('members', {
    operations: ['get', 'create', 'update'],
    fields: { handle: { access: 'readWrite' }, note: { access: 'readWrite' } },
    relationships: { team_id: { target: () => teams, access: 'readWrite' } },
    rules: { members_team_or_note: { validator: 'teamOrNote' } },
  });
  return [teams, members];
}

/**
 * The resources over the public catalog extracted from
 * `ORACLE_MIGRATIONS`, as an application's registry module gives them;
 * `teamFields` replaces fields of `teams`.
 */
export async function extractedRegistry(
  teamFields?: object,
): Promise<ReadonlyArray<object>> {
  const catalog = await extractCatalog({ migrations: () => ORACLE_MIGRATIONS });
  return oracleRegistry(toPublicCatalog(catalog, ORACLE_TABLES), {
    teamFields,
  });
}
