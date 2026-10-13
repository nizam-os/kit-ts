/**
 * The labels of one resource type in the application's messages (resource
 * SPEC 10.1, 20.1): the function the messages hold for each member and for
 * each option, never its text, so whatever holds one renders in the locale
 * of each call (ADR 0014). Messages are recognized as `localizeIssues`
 * recognizes them, by the copy of resource-core that made them; the
 * `TypeError`s name the calling function and the declaration's names.
 * @packageDocumentation
 */
import type { Label, Messages } from '@nizam-os/resource-core';

import { localizeIssues } from '@nizam-os/resource-core';

import { ownValue } from './object';

/** The labels of one type: each member's, and each option's of the members that have options. */
export interface TypeLabels {
  /** The label of member `name`; a `TypeError` when the messages hold none. */
  readonly member: (name: string) => Label;
  /** The label of option `value` of member `name`; a `TypeError` when the messages hold none. */
  readonly option: (name: string, value: string) => Label;
}

/** Throws a `TypeError` naming `caller` when `messages` are not what a definer of resource-core returned. */
function checkMessages(caller: string, messages: Messages): void {
  try {
    localizeIssues(messages);
  } catch {
    throw new TypeError(
      `${caller}: messages must be what defineMessages or defaultMessages returned`,
    );
  }
}

/**
 * The labels `messages` hold for `type`. Throws `TypeError` naming
 * `caller` for messages no definer returned and for messages that label no
 * member of `type`, which were defined for other resources.
 */
export function typeLabels(
  caller: string,
  messages: Messages,
  type: string,
): TypeLabels {
  checkMessages(caller, messages);
  const members = ownValue(messages.fields, type);
  if (members === undefined) {
    throw new TypeError(`${caller}: the messages label no member of ${type}`);
  }
  const options = ownValue(messages.options, type) ?? {};
  return {
    member: (name) => {
      const label = ownValue(members, name);
      if (label === undefined) {
        throw new TypeError(
          `${caller}: the messages have no label for ${type}.${name}`,
        );
      }
      return label;
    },
    option: (name, value) => {
      const label = ownValue(ownValue(options, name) ?? {}, value);
      if (label === undefined) {
        throw new TypeError(
          `${caller}: the messages label not every option of ${type}.${name}`,
        );
      }
      return label;
    },
  };
}
