/**
 * The inputs the contacts application's forms render: a labeled control
 * per TanStack Form field and, once the field is touched, its first
 * error's `message`, which the control names with `aria-describedby`, as
 * WAI-ARIA ties an error to its control, so a test reads it as a screen
 * reader does. Every error a field holds is an object with a `message`,
 * the validator's issue and the server's text alike (resource SPEC 20.5).
 * @ref https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21
 */
import type { AnyFieldApi } from '@tanstack/react-form';
import type { ReactElement } from 'react';

import type { FieldOption } from '@nizam-os/resource-ui';

/** A field and the label its control shows. */
export interface InputProps {
  readonly field: AnyFieldApi;
  readonly label: string;
}

/** A choice's field, its label, and its options. */
export interface ChoiceProps extends InputProps {
  readonly options: ReadonlyArray<FieldOption>;
}

function messageOf(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * A control's name, the error under it, and the attributes that tie the
 * control to it. `AnyFieldApi` types a field's name and errors as `any`.
 */
function described(field: AnyFieldApi) {
  const name: unknown = field.name;
  const errors: ReadonlyArray<unknown> = field.state.meta.errors;
  const error = field.state.meta.isTouched ? messageOf(errors[0]) : undefined;
  const id = `${textOf(name)}-error`;
  return {
    name: textOf(name),
    attributes: {
      'aria-invalid': error !== undefined,
      'aria-describedby': error === undefined ? undefined : id,
    },
    message: error === undefined ? null : <p id={id}>{error}</p>,
  };
}

/** A text input. */
export function TextInput({ field, label }: InputProps): ReactElement {
  const { name, attributes, message } = described(field);
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        value={textOf(field.state.value)}
        onChange={(event) => {
          field.handleChange(event.target.value);
        }}
        onBlur={field.handleBlur}
        {...attributes}
      />
      {message}
    </div>
  );
}

/** A choice of one option, or none. */
export function ChoiceInput({
  field,
  label,
  options,
}: ChoiceProps): ReactElement {
  const { name, attributes, message } = described(field);
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        value={textOf(field.state.value)}
        onChange={(event) => {
          field.handleChange(event.target.value);
        }}
        onBlur={field.handleBlur}
        {...attributes}
      >
        <option value="" />
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label()}
          </option>
        ))}
      </select>
      {message}
    </div>
  );
}
