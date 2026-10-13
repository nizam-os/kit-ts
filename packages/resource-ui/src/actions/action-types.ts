/**
 * The types of record and bulk actions (resource SPEC 21): what the
 * application describes, typed by the declaration, and the models. An action
 * whose write the declaration does not serve is `never`, an update's values
 * are the client's update input of the definition (jsonapi SPEC 15.4), and a
 * record is the client's record of it (jsonapi SPEC 15.6). A resource
 * TypeScript does not know serves every write and types its records and
 * values wide. Each action of a model is typed by the call its write makes:
 * the functions infer, by name, what each action gives as `remove`.
 * @packageDocumentation
 */
import type { Operation, RecordOf, UpdateInput } from '@nizam-os/jsonapi-client';
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { WriteValidator } from '../form/form-plan';
import type { FormErrors } from '../form/form-types';
import type { DeclaredShape } from '../internal/declared';
import type { ActionCall, ActionInits, GivenRemove } from './action-calls';

/** What the actions read of a declared resource besides its members. */
export interface ActionResource extends DeclaredShape {
  readonly declaration: { readonly operations: ReadonlyArray<string> };
  readonly write: { readonly update: WriteValidator };
  /** The JSON:API definition (SPEC 11.1): the operations' builders and the cap of one request. */
  readonly resource: AnyResource;
}

/** `'danger'` for a write a person cannot take back, such as a removal. */
export type ActionTone = 'neutral' | 'danger';

/** Whether the declaration serves `TOperation`. */
type Serves<
  TResource extends ActionResource,
  TOperation extends string,
> = TOperation extends TResource['declaration']['operations'][number]
  ? true
  : false;

/** The public names of the resource's members. */
type MemberName<TResource extends ActionResource> = keyof TResource['fields'] &
  string;

/** The fixed values an update action writes: what the client's `update` takes (jsonapi SPEC 15.4). */
export type ActionValues<TResource extends ActionResource> = UpdateInput<
  TResource['resource']
>;

/** A record of the resource as a list reads it (jsonapi SPEC 15.6); a record read with includes is one too. */
export type ActionRecord<TResource extends ActionResource> = RecordOf<
  never,
  TResource['resource']
>;

/** What a bulk action's texts take: the count of the selection. */
export interface ActionCount {
  readonly count: number;
}

/**
 * A confirmation: its title, its body, and its confirming button's label,
 * the action's `label` where it gives none, each from what the action's
 * texts take.
 */
export interface ActionConfirm<TInput> {
  readonly title: (input: TInput) => string;
  readonly body?: ((input: TInput) => string) | undefined;
  readonly confirm?: ((input: TInput) => string) | undefined;
}

/** A confirmation as a model holds it: `null` for each function the application gave none of. */
interface HeldConfirm<TInput> {
  readonly title: (input: TInput) => string;
  readonly body: ((input: TInput) => string) | null;
  readonly confirm: ((input: TInput) => string) | null;
}

/** The write an action makes: a removal or an update with fixed values, as the declaration serves them. */
type WriteInit<TResource extends ActionResource> =
  | (Serves<TResource, 'remove'> extends true
      ? { readonly remove: true; readonly update?: undefined }
      : never)
  | (Serves<TResource, 'update'> extends true
      ? {
          readonly update: ActionValues<TResource>;
          readonly remove?: undefined;
        }
      : never);

/** A record's action (SPEC 21.2): one write and its texts, each taking the record but the label. */
export type RecordActionInit<TResource extends ActionResource> =
  WriteInit<TResource> & {
    readonly label: () => string;
    readonly tone?: ActionTone | undefined;
    readonly confirm?: ActionConfirm<ActionRecord<TResource>> | undefined;
    readonly done?: ((record: ActionRecord<TResource>) => string) | undefined;
    readonly hidden?:
      | ((record: ActionRecord<TResource>) => boolean)
      | undefined;
    readonly disabled?:
      | ((record: ActionRecord<TResource>) => boolean | string)
      | undefined;
  };

/** A selection's action (SPEC 21.3): one write per record and its texts, each taking `{ count }` but the label. */
export type BulkActionInit<TResource extends ActionResource> =
  WriteInit<TResource> & {
    readonly label: () => string;
    readonly tone?: ActionTone | undefined;
    readonly confirm?: ActionConfirm<ActionCount> | undefined;
    readonly done?: ((input: ActionCount) => string) | undefined;
    readonly disabled?:
      | ((ids: ReadonlyArray<string>) => boolean | string)
      | undefined;
  };

/**
 * The options of `recordActions`: the actions by name, in a menu's order,
 * and whether the person may run each. `recordActions` infers `TRemove`,
 * so the model types each action by its call.
 */
export interface RecordActionsOptions<
  TResource extends ActionResource,
  TRemove extends GivenRemove = Readonly<Record<string, true | undefined>>,
> {
  readonly actions: ActionInits<RecordActionInit<TResource>, TRemove>;
  readonly can?: ((name: keyof TRemove & string) => boolean) | undefined;
}

/** The options of `bulkActions`: as a record's, and the reason a selection is too large. */
export interface BulkActionsOptions<
  TResource extends ActionResource,
  TRemove extends GivenRemove = Readonly<Record<string, true | undefined>>,
> {
  readonly actions: ActionInits<BulkActionInit<TResource>, TRemove>;
  readonly tooMany: (input: { readonly max: number }) => string;
  readonly can?: ((name: keyof TRemove & string) => boolean) | undefined;
}

/** Whether an action shows, whether it runs, and why it does not; a hidden action is disabled too. */
export interface ActionState {
  readonly visible: boolean;
  readonly disabled: boolean;
  /** The application's reason a visible action is disabled, for a tooltip; `null` without one. */
  readonly reason: string | null;
}

/** A refused selection's texts (SPEC 21.3): each refused record's by its id, and the rest for a banner. */
export interface SelectionErrors<TName extends string = string> {
  readonly records: Readonly<Record<string, FormErrors<TName>>>;
  readonly form: ReadonlyArray<string>;
}

interface RecordActionBase<TResource extends ActionResource, TName> {
  readonly name: TName;
  readonly tone: ActionTone;
  readonly label: () => string;
  readonly confirm: HeldConfirm<ActionRecord<TResource>> | null;
  readonly done: ((record: ActionRecord<TResource>) => string) | null;
  /** Whether the action shows for `record`, and whether it runs, by `can`, `hidden`, and `disabled`. */
  state(record: ActionRecord<TResource>): ActionState;
  /** A refusal by the member of the resource each error object points at (SPEC 20.4). */
  errors(error: unknown): FormErrors<MemberName<TResource>>;
}

/** A record action that updates it: its variables are those of `resourceQueries`' `update` (jsonapi SPEC 16.2). */
interface RecordUpdateAction<
  TResource extends ActionResource,
  TName,
> extends RecordActionBase<TResource, TName> {
  readonly call: 'update';
  variables(
    record: ActionRecord<TResource>,
  ): { readonly id: string } & ActionValues<TResource>;
}

/** A record action that removes it: its variables are the record's id, as `resourceQueries`' `remove` takes it. */
interface RecordRemoveAction<
  TResource extends ActionResource,
  TName,
> extends RecordActionBase<TResource, TName> {
  readonly call: 'remove';
  variables(record: ActionRecord<TResource>): string;
}

/** A record's action, its write as the declaration serves it. */
export type RecordAction<
  TResource extends ActionResource,
  TName extends string = string,
> =
  | (Serves<TResource, 'update'> extends true
      ? RecordUpdateAction<TResource, TName>
      : never)
  | (Serves<TResource, 'remove'> extends true
      ? RecordRemoveAction<TResource, TName>
      : never);

/** What `recordActions` returns: the actions by name, in the order given, each typed by its call. */
export type RecordActions<
  TResource extends ActionResource,
  TCalls extends Readonly<Record<string, ActionCall>> = Readonly<
    Record<string, ActionCall>
  >,
> = {
  readonly [K in keyof TCalls & string]: Extract<
    RecordAction<TResource, K>,
    { readonly call: TCalls[K] }
  >;
};

interface BulkActionBase<TResource extends ActionResource, TName> {
  readonly name: TName;
  readonly tone: ActionTone;
  readonly label: () => string;
  readonly confirm: HeldConfirm<ActionCount> | null;
  readonly done: ((input: ActionCount) => string) | null;
  /** The most records one request takes: the definition's `atomic.max` (jsonapi SPEC 5.1). */
  readonly max: number;
  /** Whether the action shows for the selection, and whether it runs: never for none, nor for more than `max`. */
  state(ids: ReadonlyArray<string>): ActionState;
  /** A refusal by the record of the operation each error object points at, and by its member. */
  errors(
    error: unknown,
    ids: ReadonlyArray<string>,
  ): SelectionErrors<MemberName<TResource>>;
}

/** A bulk action that updates each record: one `update` operation per id. */
interface BulkUpdateAction<
  TResource extends ActionResource,
  TName,
> extends BulkActionBase<TResource, TName> {
  readonly call: 'update';
  operations(
    ids: ReadonlyArray<string>,
  ): ReadonlyArray<Operation<TResource['resource'], ActionRecord<TResource>>>;
}

/** A bulk action that removes each record: one `remove` operation per id. */
interface BulkRemoveAction<
  TResource extends ActionResource,
  TName,
> extends BulkActionBase<TResource, TName> {
  readonly call: 'remove';
  operations(
    ids: ReadonlyArray<string>,
  ): ReadonlyArray<Operation<TResource['resource'], undefined>>;
}

/** A selection's action, its write as the declaration serves it. */
export type BulkAction<
  TResource extends ActionResource,
  TName extends string = string,
> =
  | (Serves<TResource, 'update'> extends true
      ? BulkUpdateAction<TResource, TName>
      : never)
  | (Serves<TResource, 'remove'> extends true
      ? BulkRemoveAction<TResource, TName>
      : never);

/** What `bulkActions` returns: the actions by name, in the order given, each typed by its call. */
export type BulkActions<
  TResource extends ActionResource,
  TCalls extends Readonly<Record<string, ActionCall>> = Readonly<
    Record<string, ActionCall>
  >,
> = {
  readonly [K in keyof TCalls & string]: Extract<
    BulkAction<TResource, K>,
    { readonly call: TCalls[K] }
  >;
};
