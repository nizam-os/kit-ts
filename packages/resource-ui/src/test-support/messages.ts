/**
 * The unit tests' messages (resource SPEC 20.8): `defaultMessages`' English
 * texts, with every label, every issue kind's message, and the `check`
 * constraint's texts a closure that reads `locale`, so a test switches the
 * language as Paraglide does it, by changing what the message functions
 * read, and never by building other messages; an action's texts are made the
 * same way. Not published with the package.
 * @ref https://paraglidejs.com/basics#dynamic-messages
 * @packageDocumentation
 */
import type { Label, Message, Messages } from '@nizam-os/resource-core';

import { defaultMessages, defineMessages } from '@nizam-os/resource-core';

import { RESOURCES } from './resources';

type Locale = 'de' | 'en';

let locale: Locale = 'de';

/** Makes every message read `next`, as Paraglide's `setLocale` does. */
export function setLocale(next: Locale): void {
  locale = next;
}

/** A text without inputs that reads the locale at each call: a label, or an action's text. */
export function text(german: string, english: string): Label {
  return () => (locale === 'de' ? german : english);
}

/** A message of `TInputs` that reads the locale at each call, as a Paraglide message with inputs does. */
export function message<TInputs extends object>(
  german: (inputs: TInputs) => string,
  english: (inputs: TInputs) => string,
): Message<TInputs> {
  return (inputs) => (locale === 'de' ? german(inputs) : english(inputs));
}

const english = defaultMessages(RESOURCES);

/** A message per issue kind, the field's label in the `required` one. */
const validation: Messages['validation'] = {
  required: message(
    ({ field }) => `${field} fehlt.`,
    ({ field }) => `${field} is missing.`,
  ),
  type: message(
    ({ type }) => `Erwartet: ${type}.`,
    ({ type }) => `Expected: ${type}.`,
  ),
  format: message(
    ({ format }) => `Kein gültiges Format: ${format}.`,
    ({ format }) => `Not a valid ${format}.`,
  ),
  minLength: message(
    ({ limit }) => `Mindestens ${limit} Zeichen.`,
    ({ limit }) => `At least ${limit} characters.`,
  ),
  maxLength: message(
    ({ limit }) => `Höchstens ${limit} Zeichen.`,
    ({ limit }) => `At most ${limit} characters.`,
  ),
  minimum: message(
    ({ limit }) => `Mindestens ${limit}.`,
    ({ limit }) => `At least ${limit}.`,
  ),
  maximum: message(
    ({ limit }) => `Höchstens ${limit}.`,
    ({ limit }) => `At most ${limit}.`,
  ),
  exclusiveMinimum: message(
    ({ limit }) => `Größer als ${limit}.`,
    ({ limit }) => `More than ${limit}.`,
  ),
  exclusiveMaximum: message(
    ({ limit }) => `Kleiner als ${limit}.`,
    ({ limit }) => `Less than ${limit}.`,
  ),
  multipleOf: message(
    ({ limit }) => `Ein Vielfaches von ${limit}.`,
    ({ limit }) => `A multiple of ${limit}.`,
  ),
  enum: message(
    ({ values }) => `Eines von: ${values}.`,
    ({ values }) => `One of: ${values}.`,
  ),
  pattern: message(
    () => 'Hat nicht die erwartete Form.',
    () => 'Does not have the expected form.',
  ),
  additionalProperties: message(
    () => 'Unbekanntes Feld.',
    () => 'Unknown member.',
  ),
};

export const messages: Messages = defineMessages(
  RESOURCES,
  {},
  {
    ...english,
    constraints: {
      ...english.constraints,
      check: {
        title: text('Regel verletzt', 'Rule broken'),
        detail: message(
          ({ fields }) => `Verletzt die Regel über ${fields}.`,
          ({ fields }) => `Breaks the rule over ${fields}.`,
        ),
      },
    },
    validation,
    fields: {
      plans: { seats: text('Plätze', 'Seats') },
      organizations: {
        name: text('Name', 'Name'),
        verified: text('Geprüft', 'Verified'),
        marketingOptIn: text('Werbung erlaubt', 'Marketing allowed'),
        openDays: text('Öffnungstage', 'Open days'),
        foundedOn: text('Gegründet am', 'Founded on'),
        inviteCode: text('Einladungscode', 'Invite code'),
        createdAt: text('Erstellt am', 'Created at'),
        plan: text('Tarif', 'Plan'),
      },
      contacts: {
        kind: text('Art', 'Kind'),
        name: text('Name', 'Name'),
        nickname: text('Spitzname', 'Nickname'),
        email: text('E-Mail', 'Email'),
        status: text('Status', 'Status'),
        priority: text('Priorität', 'Priority'),
        discount: text('Rabatt', 'Discount'),
        lifetimeValue: text('Kundenwert', 'Lifetime value'),
        score: text('Bewertung', 'Score'),
        tags: text('Schlagwörter', 'Tags'),
        ratings: text('Bewertungen', 'Ratings'),
        channels: text('Kanäle', 'Channels'),
        vip: text('VIP', 'VIP'),
        birthday: text('Geburtstag', 'Birthday'),
        followUpAt: text('Wiedervorlage', 'Follow up at'),
        details: text('Details', 'Details'),
        createdAt: text('Erstellt am', 'Created at'),
        organization: text('Organisation', 'Organization'),
        referredBy: text('Empfohlen von', 'Referred by'),
      },
    },
    options: {
      contacts: {
        kind: {
          person: text('Person', 'Person'),
          company: text('Firma', 'Company'),
        },
        status: {
          active: text('Aktiv', 'Active'),
          archived: text('Archiviert', 'Archived'),
        },
        channels: {
          email: text('E-Mail', 'Email'),
          phone: text('Telefon', 'Phone'),
          post: text('Post', 'Mail'),
        },
      },
    },
  },
);
