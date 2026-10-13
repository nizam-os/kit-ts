/**
 * `bulkActions(resource, options)` (resource SPEC 21.3): a selection's
 * actions from the declaration, each one Atomic Operations request (jsonapi
 * SPEC 17), which commits whole or not at all: one operation per selected
 * id, built with the definition's `operationsOf` and sent by
 * `operationsMutation` (jsonapi SPEC 17.4). A selection is the ids of its
 * records, as a table's row selection keyed by `id` holds them, so every
 * member reads ids; the cap of one request is the definition's `atomic.max`
 * (jsonapi ADR 0023), so a selection over it is refused before anything is
 * sent.
 * @packageDocumentation
 */
import type { Operation } from '@nizam-os/jsonapi-client';

import type { ActionCalls, GivenRemove } from './action-calls';
import type { HeldAction } from './action-init';
import type { SelectionFault } from './action-state';
import type {
  ActionResource,
  BulkActions,
  BulkActionsOptions,
} from './action-types';

import { operationsOf } from '@nizam-os/jsonapi-client';

import { checkDeclared } from '../internal/declared';
import { selectionErrors } from './action-errors';
import { BULK_ACTIONS, functionAt, readOptions } from './action-init';
import { bulkState, selectionFault } from './action-state';

const CALLER = 'bulkActions';

/** What `operations` takes, by the fault that keeps a list from being it. */
const TAKES: Readonly<Record<SelectionFault, (max: number) => string>> = {
  list: () => 'a list of ids',
  empty: () => 'at least one id',
  twice: () => 'each id once',
  tooMany: (max) => `at most ${String(max)} ids`,
};

/** What `operations` gives for `action`: one operation per id, in order. */
function operationsFor(
  resource: ActionResource,
  action: HeldAction,
  max: number,
): (ids: unknown) => ReadonlyArray<unknown> {
  const builders = operationsOf(resource.resource);
  const build: (id: string) => Operation =
    action.call === 'remove'
      ? (id) => builders.remove(id)
      : (id) => builders.update(id, action.values);
  return (ids) => {
    const fault = selectionFault(ids, max);
    if (fault !== undefined) {
      throw new TypeError(
        `${CALLER}: ${action.name}.operations takes ${TAKES[fault](max)}`,
      );
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: selectionFault found no fault, so `ids` is a list of distinct strings
    return Object.freeze((ids as ReadonlyArray<string>).map((id) => build(id)));
  };
}

/**
 * A selection's actions on `resource`, by name in the order of
 * `options.actions`, each typed by the call it makes. Throws `TypeError`
 * before it returns for a resource no `declareResource` returned and for
 * each argument SPEC 21.4 refuses.
 */
export function bulkActions<
  TResource extends ActionResource,
  TRemove extends GivenRemove,
>(
  resource: TResource,
  options: BulkActionsOptions<TResource, TRemove>,
): BulkActions<TResource, ActionCalls<TRemove>> {
  checkDeclared(CALLER, resource);
  const { actions, can } = readOptions(BULK_ACTIONS, resource, options);
  const tooMany = functionAt(CALLER, 'options.tooMany', options.tooMany);
  const { max } = resource.resource.atomic;
  const model = Object.fromEntries(
    actions.map((action) => [
      action.name,
      Object.freeze({
        name: action.name,
        call: action.call,
        tone: action.tone,
        label: action.label,
        confirm: action.confirm,
        done: action.done,
        max,
        state: (ids: unknown) => bulkState(action, { can, max, tooMany }, ids),
        operations: operationsFor(resource, action, max),
        errors: (error: unknown, ids: unknown) =>
          selectionErrors(resource.fields, error, ids),
      }),
    ]),
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: readOptions held each action to the declaration, which BulkActions types by the same operations and update input, gave each the call its remove names, and each operation is the definition's own builder's
  return Object.freeze(model) as unknown as BulkActions<
    TResource,
    ActionCalls<TRemove>
  >;
}
