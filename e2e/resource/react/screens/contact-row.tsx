/**
 * A row of the contacts' actions screen (`contact-actions.tsx`) and the
 * table it belongs to: the record's checkbox, its cells, and the menu of the
 * actions its state shows, each disabled with its reason as its title. A
 * refusal's text of a member lands under the member's cell, and the record's
 * other texts under its menu; the checkbox, which stands for the record, is
 * then invalid and described by each of them, as an input is by its error. A
 * record action's texts that name no member are the screen's.
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/row-selection
 * @ref https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21
 */
import type { Row } from '@tanstack/react-table';
import type { ReactElement } from 'react';

import type { FormErrors, RecordAction } from '@nizam-os/resource-ui';

import type { Contact } from '../../support/contact-queries.ts';

import {
  createColumnHelper,
  FlexRender,
  rowSelectionFeature,
  tableFeatures,
} from '@tanstack/react-table';

import { fieldsOf } from '@nizam-os/resource-ui';

import { contactMessages } from '../../localization/contact-messages.ts';
import { Contacts } from '../../resources/contacts.ts';

/** Built once, at startup, beside the descriptors. */
const contactFields = fieldsOf(Contacts, contactMessages);

/** The label of the status option `value`. */
function statusLabel(value: string): string {
  return (
    contactFields.status.options
      ?.find((option) => option.value === value)
      ?.label() ?? value
  );
}

// At module scope: Table rebuilds its rows when its features, columns, or data are new.
export const features = tableFeatures({ rowSelectionFeature });
const column = createColumnHelper<typeof features, Contact>();
export const columns = column.columns([
  column.accessor('name', { header: () => contactFields.name.label() }),
  column.accessor('email', { header: () => contactFields.email.label() }),
  column.accessor('status', {
    header: () => contactFields.status.label(),
    cell: (info) => statusLabel(info.getValue()),
  }),
]);

/** The props of `ContactRow`. */
export interface ContactRowProps {
  readonly row: Row<typeof features, Contact>;
  /** The record's refusal, `undefined` without one. */
  readonly refusal: FormErrors | undefined;
  readonly actions: ReadonlyArray<RecordAction<typeof Contacts>>;
  /** Whether a write is under way, which holds every action back. */
  readonly busy: boolean;
  readonly onAction: (
    action: RecordAction<typeof Contacts>,
    contact: Contact,
  ) => void;
}

/** The row of a contact, its refusal's texts under the cells they name. */
export function ContactRow({
  row,
  refusal,
  actions,
  busy,
  onAction,
}: ContactRowProps): ReactElement {
  const contact = row.original;
  const cells = row.getAllCells();
  const fields = refusal?.fields ?? {};
  const shown = new Set(cells.map((cell) => cell.column.id));
  // The record's texts no cell shows: a member's without a column, and its own.
  const others = [
    ...Object.entries(fields).flatMap(([member, text]) =>
      shown.has(member) || text === undefined ? [] : [text],
    ),
    ...(refusal?.form ?? []),
  ];
  const described = [
    ...cells.flatMap((cell) =>
      fields[cell.column.id] === undefined
        ? []
        : [`${row.id}-${cell.column.id}`],
    ),
    ...others.map((_text, index) => `${row.id}-${String(index)}`),
  ];
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={`${contact.name} auswählen`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          aria-invalid={described.length > 0}
          aria-describedby={
            described.length === 0 ? undefined : described.join(' ')
          }
        />
      </td>
      {cells.map((cell) => {
        const text = fields[cell.column.id];
        return (
          <td key={cell.id}>
            <FlexRender cell={cell} />
            {text === undefined ? null : (
              <p id={`${row.id}-${cell.column.id}`}>{text}</p>
            )}
          </td>
        );
      })}
      <td>
        {actions.map((action) => {
          const { visible, disabled, reason } = action.state(contact);
          return visible ? (
            <button
              key={action.name}
              type="button"
              disabled={disabled || busy}
              title={reason ?? undefined}
              onClick={() => {
                onAction(action, contact);
              }}
            >
              {action.label()}
            </button>
          ) : null;
        })}
        {others.map((text, index) => (
          <p key={text} id={`${row.id}-${String(index)}`}>
            {text}
          </p>
        ))}
      </td>
    </tr>
  );
}
