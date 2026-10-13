/**
 * The tests' messages (resource SPEC 20.8): `defaultMessages`' English
 * texts, with every label and every issue kind's message a closure that
 * reads `locale`, so a test switches the language as Paraglide does it, by
 * changing what the message functions read, and never by building other
 * messages. Not published with the package.
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

/** A label that reads the locale at each call. */
function text(german: string, english: string): Label {
  return () => (locale === 'de' ? german : english);
}

/** A message that reads the locale at each call. */
function message<TInputs extends object>(
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
    validation,
    fields: {
      workspaces: { name: text('Name', 'Name') },
      labels: { name: text('Name', 'Name') },
      tasks: {
        title: text('Titel', 'Title'),
        points: text('Punkte', 'Points'),
        dueOn: text('Fällig am', 'Due on'),
        tags: text('Schlagwörter', 'Tags'),
        done: text('Erledigt', 'Done'),
        workspace: text('Arbeitsbereich', 'Workspace'),
        label: text('Etikett', 'Label'),
      },
    },
  },
);
