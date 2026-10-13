/**
 * `defaultMessages(resources, appErrors?)` (SPEC 10.2): complete English
 * messages built from the resources alone. The codes no resource derives
 * take their catalog titles and generic details, an application code its
 * `description` or else its title as the detail; each constraint kind
 * takes the title and detail of SPEC 9.1; each issue kind its English
 * message (SPEC 6.4); each member a label made from its public name; and
 * each option its value. An application without an i18n library uses it as
 * is; one with Paraglide maps its own message functions instead.
 * @packageDocumentation
 */
import type { Catalog, EmptyCatalog } from '@nizam-os/ban-core';

import type { AnyDeclaredResource } from '../declare/declared-resource';
import type { RegistryCheck } from '../registry/registry-check';
import type { MessageIndex } from './message-index';
import type { MessagesFor } from './messages-for';
import type { ConstraintInputs, ErrorText, Label, Messages } from './types';

import { BUILTIN_CATALOG, resolveDefinition } from '@nizam-os/ban-core';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';

import { KIND_DETAIL, KIND_STATUS } from '../errors/error-entry';
import { QUOTA_EXCEEDED_CATALOG } from '../errors/quota-exceeded';
import { checkRegistry } from '../registry/check-registry';
import { createMessages } from './define-messages';
import { CODE_DETAILS, ISSUE_MESSAGES, labelOf } from './english';
import { messageIndex } from './message-index';

const CALLER = 'defaultMessages';

/** The definitions of the codes no resource derives besides the application's. */
const DEFINITIONS: Catalog = {
  ...BUILTIN_CATALOG,
  ...ERROR_CATALOG,
  ...QUOTA_EXCEEDED_CATALOG,
};

const DETAILS: ReadonlyMap<string, string> = new Map(
  Object.entries(CODE_DETAILS),
);

/** A message that always reads `text`. */
function constant(text: string): Label {
  return () => text;
}

function errorText(title: string, detail: string): ErrorText<ConstraintInputs> {
  return { title: constant(title), detail: constant(detail) };
}

/** The texts of a code no resource derives: an application code's title and description, else the catalog title and the generic detail. */
function codeText(
  code: string,
  appErrors: Catalog,
): ErrorText<ConstraintInputs> {
  const app = appErrors[code];
  if (app !== undefined) {
    const { title, description } = resolveDefinition(code, app);
    return errorText(title, description);
  }
  const definition = DEFINITIONS[code];
  const title =
    definition === undefined ? code : resolveDefinition(code, definition).title;
  return errorText(title, DETAILS.get(code) ?? title);
}

function labels(
  names: ReadonlyArray<string>,
  label: (name: string) => string,
): Readonly<Record<string, Label>> {
  return Object.fromEntries(names.map((name) => [name, constant(label(name))]));
}

/** The English messages of `index`. */
function englishMessages(index: MessageIndex, appErrors: Catalog): Messages {
  return {
    errors: Object.fromEntries(
      index.codes.map((code) => [code, codeText(code, appErrors)]),
    ),
    constraints: Object.fromEntries(
      index.kinds.map((kind) => [
        kind,
        errorText(KIND_STATUS[kind].title, KIND_DETAIL[kind]),
      ]),
    ),
    validation: ISSUE_MESSAGES,
    fields: Object.fromEntries(
      [...index.members].map(([type, members]) => [
        type,
        labels(members, labelOf),
      ]),
    ),
    options: Object.fromEntries(
      [...index.options].map(([type, fields]) => [
        type,
        Object.fromEntries(
          [...fields].map(([field, values]) => [
            field,
            labels(values, (value) => value),
          ]),
        ),
      ]),
    ),
  };
}

/** The complete English messages of `resources` and `appErrors`. Throws `TypeError` for a registry conflict (SPEC 4.2). */
export function defaultMessages<
  const TResources extends ReadonlyArray<AnyDeclaredResource>,
  const TApp extends Catalog = EmptyCatalog,
>(
  resources: TResources & RegistryCheck<TResources>,
  appErrors?: TApp,
): MessagesFor<TResources, TApp> {
  const registry = checkRegistry(CALLER, resources, appErrors);
  const index = messageIndex(registry.resources, registry.appErrors);
  const messages = createMessages(
    CALLER,
    index,
    englishMessages(index, registry.appErrors),
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: built key by key from the index createMessages checked it against
  return messages as unknown as MessagesFor<TResources, TApp>;
}
