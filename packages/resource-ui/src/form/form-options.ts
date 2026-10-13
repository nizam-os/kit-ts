/**
 * The arguments of `resourceForm` a JavaScript caller may get wrong
 * (resource SPEC 20.1, 20.3): the operation, which the resource must
 * serve, and the options, where `record` is required on update and
 * refused on create and `members` names members the operation writes,
 * each once. Each `TypeError` names the function, the option, and the
 * declaration's names.
 * @packageDocumentation
 */
import type { Messages } from '@nizam-os/resource-core';

import type { FieldDescriptor } from '../fields/fields-of';
import type { FormOperation, FormRecord } from './form-types';

import { isRecord } from '../internal/object';

const CALLER = 'resourceForm';

const OPTIONS: ReadonlySet<string> = new Set(['messages', 'record', 'members']);

/** The access of the members each operation writes (SPEC 3.1). */
const WRITTEN: Readonly<Record<FormOperation, ReadonlySet<string>>> = {
  create: new Set(['readWrite', 'immutable', 'write']),
  update: new Set(['readWrite', 'write']),
};

/** What a resource's declaration says it serves. */
interface Served {
  readonly names: { readonly type: string };
  readonly declaration: { readonly operations: ReadonlyArray<string> };
}

/** Throws unless `operation` is `create` or `update` and `resource` serves it. */
export function checkOperation(
  resource: Served,
  operation: unknown,
): asserts operation is FormOperation {
  if (operation !== 'create' && operation !== 'update') {
    throw new TypeError(`${CALLER}: operation must be create or update`);
  }
  if (!resource.declaration.operations.includes(operation)) {
    throw new TypeError(
      `${CALLER}: ${resource.names.type} does not serve ${operation}`,
    );
  }
}

/** The options a JavaScript caller passed, checked for `operation`; the messages are checked where they are read. */
export interface CheckedOptions {
  readonly messages: Messages;
  readonly record: FormRecord | undefined;
  readonly members: ReadonlyArray<string> | undefined;
}

function checkRecord(operation: FormOperation, record: unknown): void {
  if (operation === 'create' && record !== undefined) {
    throw new TypeError(
      `${CALLER}: options.record is for update; a create starts from the defaults`,
    );
  }
  if (operation === 'update' && !isRecord(record)) {
    throw new TypeError(
      `${CALLER}: options.record must be the record an update edits`,
    );
  }
}

function checkMembers(members: unknown): void {
  if (
    members !== undefined &&
    !(
      Array.isArray(members) &&
      members.every((name: unknown) => typeof name === 'string')
    )
  ) {
    throw new TypeError(
      `${CALLER}: options.members must be a list of public names`,
    );
  }
}

/** Throws for options that are not an object, hold an unknown key, or do not fit `operation`. */
export function checkOptions(
  operation: FormOperation,
  options: unknown,
): CheckedOptions {
  if (!isRecord(options)) {
    throw new TypeError(`${CALLER}: options must be an object`);
  }
  for (const key of Object.keys(options)) {
    if (!OPTIONS.has(key)) {
      throw new TypeError(`${CALLER}: options.${key} is not an option`);
    }
  }
  const { messages, record, members } = options;
  checkRecord(operation, record);
  checkMembers(members);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: checkRecord and checkMembers threw for any other value, and every reader of the messages checks them first (`typeLabels`)
  return { messages, record, members } as CheckedOptions;
}

/**
 * The descriptors of the members the form holds, in declaration order: of
 * those the operation writes, every one, or the ones `members` names.
 * Throws for a name the operation does not write and for one named twice.
 */
export function heldDescriptors(
  type: string,
  operation: FormOperation,
  descriptors: ReadonlyArray<FieldDescriptor>,
  members?: ReadonlyArray<string>,
): ReadonlyArray<FieldDescriptor> {
  const written = descriptors.filter((descriptor) =>
    WRITTEN[operation].has(descriptor.meta.access),
  );
  if (members === undefined) {
    return written;
  }
  const names = new Set<string>();
  for (const name of members) {
    if (!written.some((descriptor) => descriptor.name === name)) {
      throw new TypeError(
        `${CALLER}: options.members names ${name}, which the ${operation} of ${type} does not write`,
      );
    }
    if (names.has(name)) {
      throw new TypeError(`${CALLER}: options.members names ${name} twice`);
    }
    names.add(name);
  }
  return written.filter((descriptor) => names.has(descriptor.name));
}
