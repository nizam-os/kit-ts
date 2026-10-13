/**
 * `defineMessages(resources, appErrors, messages)` (SPEC 10.1): the
 * application's messages, checked against the resources and its own codes,
 * returned as a frozen copy that `localizeErrors` takes. The registry
 * checks of SPEC 4.2 run first, as in `errorCatalog`, so the list is the
 * registry the application serves. Checked messages are known by a
 * `WeakMap` membership, so a copy, such as an object spread of one, is
 * known again only after it passes through `defineMessages`.
 * @packageDocumentation
 */
import type { Catalog, EmptyCatalog } from '@nizam-os/ban-core';

import type { AnyDeclaredResource } from '../declare/declared-resource';
import type { RegistryCheck } from '../registry/registry-check';
import type { MessageIndex } from './message-index';
import type { MessagesFor } from './messages-for';
import type { Messages } from './types';

import { isRecord } from '../internal/object';
import { checkRegistry } from '../registry/check-registry';
import { checkMessages } from './check-messages';
import { messageIndex } from './message-index';

const CALLER = 'defineMessages';

const CHECKED = new WeakMap<object, MessageIndex>();

/** Messages `defineMessages` returned, and the index they were checked against. */
export interface CheckedMessages {
  readonly messages: Messages;
  readonly index: MessageIndex;
}

/** The checked messages `value` is, or `undefined` when `defineMessages` did not return it. */
export function checkedMessages(value: unknown): CheckedMessages | undefined {
  const index = isRecord(value) ? CHECKED.get(value) : undefined;
  if (index === undefined) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: only createMessages adds to CHECKED, and only a value checkMessages accepted
  const messages = value as Messages;
  return { messages, index };
}

/** A deep copy of checked messages, every object frozen and every function kept. */
function frozenCopy(value: unknown): unknown {
  return isRecord(value)
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, frozenCopy(entry)]),
        ),
      )
    : value;
}

/**
 * `messages` checked against `index`, frozen and known to
 * `localizeErrors`. Throws one `TypeError` naming every problem, each
 * prefixed with `caller` and its path.
 */
export function createMessages<TMessages>(
  caller: string,
  index: MessageIndex,
  messages: TMessages,
): TMessages {
  const problems = checkMessages(`${caller}.messages`, messages, index);
  if (problems.length > 0) {
    throw new TypeError(problems.join('; '));
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: a deep copy of messages, which checkMessages accepted against the same index
  const copy = frozenCopy(messages) as TMessages & object;
  CHECKED.set(copy, index);
  return copy;
}

/**
 * The messages of `resources` and `appErrors`, frozen. Throws `TypeError`
 * for a registry conflict (SPEC 4.2), and for every missing or unknown key
 * and every message that is not a function, all in one message.
 */
export function defineMessages<
  const TResources extends ReadonlyArray<AnyDeclaredResource>,
  const TApp extends Catalog = EmptyCatalog,
>(
  resources: TResources & RegistryCheck<TResources>,
  appErrors: TApp,
  // NoInfer: inferring TApp from the keys of `errors` would make every
  // derived code an application code.
  messages: NoInfer<MessagesFor<TResources, TApp>>,
): MessagesFor<TResources, TApp> {
  const registry = checkRegistry(CALLER, resources, appErrors);
  return createMessages(
    CALLER,
    messageIndex(registry.resources, registry.appErrors),
    messages,
  );
}
