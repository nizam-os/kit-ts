import { z } from 'zod';

/**
 * The contacts application's validators (resource SPEC 7.2), each the twin
 * of a CHECK the rule translator leaves untranslated. A CHECK passes
 * `NULL`, so a validator of a nullable column accepts `null`.
 *
 * - `email`: the `email` domain's `value ~ '^[^@ ]+@[^@ ]+$'`, untranslated
 *   because `~` on `citext` ignores case (the pattern has no letters, so
 *   the twin need not).
 * - `lowercase`: `room = lower(room)` and the `handle` domain's
 *   `value = lower(value)`. The fixtures keep to ASCII: beyond it
 *   PostgreSQL's `lower()` follows the database's `LC_CTYPE`.
 * - `contactOrNotes`: `contact_id is not null or notes is not null`, over
 *   the public names, the relationship as its id.
 */
import { defineValidator } from '@nizam-os/resource-core';

export const validators = {
  email: defineValidator({
    schema: z
      .string()
      .regex(/^[^@ ]+@[^@ ]+$/u)
      .nullable(),
    fixtures: {
      accept: ['ada@example.com', 'ADA@EXAMPLE.COM', null],
      reject: ['ada.example.com', 'ada@@example.com', 'ada @example.com'],
    },
  }),
  lowercase: defineValidator({
    schema: z
      .string()
      .refine((value) => value === value.toLowerCase())
      .nullable(),
    fixtures: { accept: ['lobby-2', '', null], reject: ['Lobby-2'] },
  }),
  contactOrNotes: defineValidator({
    schema: z
      .object({ contact: z.uuid().nullable(), notes: z.string().nullable() })
      .refine(({ contact, notes }) => contact !== null || notes !== null),
    fixtures: {
      accept: [
        { contact: '0e2f7c64-8d43-4b6e-9a51-2f3c8b9d1a07', notes: null },
        { contact: null, notes: 'Bring the signed contract.' },
      ],
      reject: [{ contact: null, notes: null }],
    },
  }),
};
