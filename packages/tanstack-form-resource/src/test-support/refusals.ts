/**
 * A task create, and the server's refusals of it the binding tests bind
 * (resource SPEC 20.5, 20.8): the 409 of `tasks_workspace_id_title_key
 * (workspace_id, title)`, one error object per member (SPEC 9.1), and the
 * 404 of the label's foreign key, one object on the relationship, each as
 * a `ResponseError` of the client. Not published with the package.
 * @packageDocumentation
 */
import type { FormModel } from '@nizam-os/resource-ui';

import type { MountedForm } from './forms';

import { ResponseError } from '@nizam-os/jsonapi-client';
import { resourceForm } from '@nizam-os/resource-ui';

import { bindResponseErrors } from '../bind-errors';
import { mountForm } from './forms';
import { messages } from './messages';
import { Tasks } from './resources';

/** A create form that holds four members: two attributes, the workspace, and the label. */
export const taskCreate: FormModel<
  Readonly<Record<string, unknown>>,
  unknown
> = resourceForm(Tasks, 'create', {
  messages,
  members: ['title', 'points', 'workspace', 'label'],
});

export const TAKEN = 'Diesen Titel hat schon eine Aufgabe des Arbeitsbereichs.';
export const MISSING = 'Das Etikett gibt es nicht.';

/** A refused create whose body is an error document of `errors`. */
export function refused(
  status: number,
  errors: ReadonlyArray<unknown>,
): ResponseError {
  return new ResponseError({
    type: 'tasks',
    call: 'create',
    status,
    body: { errors },
  });
}

/** One error object of the 409, on the member `pointer` names. */
function taken(pointer: string) {
  return {
    status: '409',
    code: 'TASKS_WORKSPACE_ID_TITLE_KEY',
    title: 'Konflikt',
    detail: TAKEN,
    source: { pointer },
  };
}

/** The 409 of the unique constraint over the workspace and the title. */
export const TITLE_TAKEN: ResponseError = refused(409, [
  taken('/data/relationships/workspace'),
  taken('/data/attributes/title'),
]);

/** The 404 of the label's foreign key. */
export const NO_LABEL: ResponseError = refused(404, [
  {
    status: '404',
    code: 'TASKS_LABEL_ID_FKEY',
    title: 'Nicht gefunden',
    detail: MISSING,
    source: { pointer: '/data/relationships/label' },
  },
]);

/** A form a person sent, the writes its handler sent, the first refused. */
export interface RefusedForm extends MountedForm {
  readonly writes: ReadonlyArray<unknown>;
}

/**
 * The create form, filled in validly and submitted, whose handler sends
 * the write as an application's does and binds the refusal when the send
 * throws: the server refuses the first write with `refusal` and takes
 * every one after.
 */
export async function refusedOnce(
  refusal: ResponseError,
): Promise<RefusedForm> {
  const writes: Array<unknown> = [];
  const send = (write: unknown): void => {
    writes.push(write);
    if (writes.length === 1) {
      throw refusal;
    }
  };
  const mounted = mountForm(taskCreate, {
    onSubmit: (values, form) => {
      try {
        send(taskCreate.write(values));
      } catch (error) {
        bindResponseErrors(form, taskCreate, error);
      }
    },
  });
  mounted.field('title').handleChange('Plan the launch');
  mounted.field('workspace').handleChange('1');
  mounted.field('label').handleChange('ABCD');
  await mounted.form.handleSubmit();
  return { ...mounted, writes };
}
