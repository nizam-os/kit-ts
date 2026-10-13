/**
 * The contacts application's actions as the resource-ui README writes them
 * (resource SPEC 21): a menu of `recordActions` in each row and a bar of
 * `bulkActions` over the selection, both built at module scope from the
 * application's Paraglide messages. TanStack Query reads the list for the
 * state the list model accepts of a search, and TanStack Table v9 shows it,
 * its row selection held by the screen and keyed by the contacts' ids. A
 * row's action makes the client's own call through `resourceQueries`'
 * mutations; the bar sends the selection in one Atomic Operations request
 * through `operationsMutation`. An action with a confirmation asks for it
 * in a dialog first. What an action did is announced in a status; a
 * refusal lands on the rows of its records (`contact-row.tsx`), and the
 * rest of it in an alert.
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/row-selection
 * @ref https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
 */
import type { RowSelectionState } from '@tanstack/react-table';
import type { ReactElement } from 'react';

import type {
  BulkAction,
  ListState,
  RecordAction,
  SelectionErrors,
} from '@nizam-os/resource-ui';

import type {
  Contact,
  ContactActionQueries,
} from '../../support/contact-queries.ts';
import type { ConfirmTexts } from './confirm-dialog.tsx';

import { useMutation, useQuery } from '@tanstack/react-query';
import { FlexRender, useTable } from '@tanstack/react-table';
import { useState } from 'react';

import {
  bulkActions,
  recordActions,
  resourceList,
} from '@nizam-os/resource-ui';

import { contactMessages } from '../../localization/contact-messages.ts';
import { m } from '../../localization/paraglide/messages.js';
import { Contacts } from '../../resources/contacts.ts';
import { ConfirmDialog, confirmTexts } from './confirm-dialog.tsx';
import { columns, ContactRow, features } from './contact-row.tsx';

/** Built once, at startup: an action the declaration does not serve throws here, not on a click. */
const contactsList = resourceList(Contacts, contactMessages);
const contactActions = recordActions(Contacts, {
  actions: {
    archive: {
      label: m.contact_archive,
      update: { attributes: { status: 'archived' } },
      hidden: (contact) => contact.status === 'archived',
      done: (contact) => m.contact_archived({ name: contact.name }),
    },
    remove: {
      label: m.contact_remove,
      tone: 'danger',
      remove: true,
      confirm: {
        title: (contact) => m.contact_remove_title({ name: contact.name }),
        body: m.contact_remove_body,
      },
      done: (contact) => m.contact_removed({ name: contact.name }),
    },
  },
});
const selectionActions = bulkActions(Contacts, {
  tooMany: m.selection_too_many,
  actions: {
    restore: {
      label: m.contacts_restore,
      update: { attributes: { status: 'active' } },
      done: m.contacts_restored,
    },
    remove: {
      label: m.contacts_remove,
      tone: 'danger',
      remove: true,
      confirm: {
        title: m.contacts_remove_title,
        confirm: m.contacts_remove_confirm,
      },
      done: m.contacts_removed,
    },
  },
});
const rowActions = Object.values(contactActions);
const barActions = Object.values(selectionActions);

/** What the last action left: what it did, `null` for nothing, and its refusal. */
interface Outcome {
  readonly done: string | null;
  readonly refusal: SelectionErrors;
}

const NOTHING: Outcome = { done: null, refusal: { records: {}, form: [] } };
const noContacts: ReadonlyArray<Contact> = [];

/** An action waiting for the person's confirmation. */
interface Asking {
  readonly texts: ConfirmTexts;
  readonly go: () => Promise<void>;
}

/** The props of `ContactActions`. */
interface ContactActionsProps {
  readonly api: ContactActionQueries;
  readonly state: ListState<typeof Contacts>;
}

/** The list of `state`, a menu of actions in each row, and a bar of actions over the selection. */
function ContactActions({ api, state }: ContactActionsProps): ReactElement {
  const result = useQuery(api.contacts.list(state));
  const update = useMutation(api.contacts.update());
  const remove = useMutation(api.contacts.remove());
  const operations = useMutation(api.operations);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [asking, setAsking] = useState<Asking | null>(null);
  const [outcome, setOutcome] = useState(NOTHING);
  const table = useTable({
    features,
    columns,
    data: result.data?.data ?? noContacts,
    getRowId: (contact) => contact.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
  });
  // The selected rows the page shows: the id of a record the list no longer holds drops out.
  const ids = table.getSelectedRowModel().rows.map(({ id }) => id);
  const busy = update.isPending || remove.isPending || operations.isPending;

  const run = async (
    action: RecordAction<typeof Contacts>,
    contact: Contact,
  ) => {
    setOutcome(NOTHING);
    try {
      await (action.call === 'remove'
        ? remove.mutateAsync(action.variables(contact))
        : update.mutateAsync(action.variables(contact)));
      setOutcome({ ...NOTHING, done: action.done?.(contact) ?? null });
    } catch (error) {
      const { fields, form } = action.errors(error);
      setOutcome({
        done: null,
        refusal: { records: { [contact.id]: { fields, form: [] } }, form },
      });
    }
  };

  const runOnSelection = async (
    action: BulkAction<typeof Contacts>,
    selected: ReadonlyArray<string>,
  ) => {
    setOutcome(NOTHING);
    try {
      await operations.mutateAsync(action.operations(selected));
      setRowSelection({});
      setOutcome({
        ...NOTHING,
        done: action.done?.({ count: selected.length }) ?? null,
      });
    } catch (error) {
      setOutcome({ done: null, refusal: action.errors(error, selected) });
    }
  };

  /** Runs `go` at once without `texts`, else once the person confirms them. */
  const ask = (texts: ConfirmTexts | null, go: () => Promise<void>) => {
    if (texts === null) {
      void go();
    } else {
      setAsking({ texts, go });
    }
  };

  return (
    <>
      <div role="toolbar" aria-label="Auswahl">
        {barActions.map((action) => {
          const { visible, disabled, reason } = action.state(ids);
          return visible ? (
            <button
              key={action.name}
              type="button"
              disabled={disabled || busy}
              title={reason ?? undefined}
              onClick={() => {
                ask(confirmTexts(action, { count: ids.length }), async () =>
                  runOnSelection(action, ids),
                );
              }}
            >
              {action.label()}
            </button>
          ) : null;
        })}
      </div>
      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              <th>
                <input
                  type="checkbox"
                  aria-label="Alle auswählen"
                  checked={table.getIsAllRowsSelected()}
                  onChange={table.getToggleAllRowsSelectedHandler()}
                />
              </th>
              {group.headers.map((header) => (
                <th key={header.id}>
                  <FlexRender header={header} />
                </th>
              ))}
              <th>Aktionen</th>
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <ContactRow
              key={row.id}
              row={row}
              refusal={outcome.refusal.records[row.id]}
              actions={rowActions}
              busy={busy}
              onAction={(action, contact) => {
                ask(confirmTexts(action, contact), async () =>
                  run(action, contact),
                );
              }}
            />
          ))}
        </tbody>
      </table>
      <p role="status">{outcome.done}</p>
      {outcome.refusal.form.length === 0 ? null : (
        <div role="alert">
          {outcome.refusal.form.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      )}
      {asking === null ? null : (
        <ConfirmDialog
          texts={asking.texts}
          onCancel={() => {
            setAsking(null);
          }}
          onConfirm={() => {
            setAsking(null);
            void asking.go();
          }}
        />
      )}
    </>
  );
}

/** The screen over the list a route's `search` holds, as the list model accepts it. */
export function contactActionsScreen(
  api: ContactActionQueries,
  search: Readonly<Record<string, unknown>>,
): ReactElement {
  return <ContactActions api={api} state={contactsList.query(search)} />;
}
