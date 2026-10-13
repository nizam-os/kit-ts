/**
 * The types of the form model (resource SPEC 20.3, 20.4): each member's
 * form value from the input type of the operation's write validator, the
 * write as the client's `create` and `update` take it, and the model.
 * A resource TypeScript does not know types every value `unknown`.
 * @packageDocumentation
 */
import type { CreateInput, UpdateInput } from '@nizam-os/jsonapi-client';
import type { Messages } from '@nizam-os/resource-core';

import type { FieldDescriptor } from '../fields/fields-of';
import type { DeclaredShape } from '../internal/declared';
import type { SyncStandardSchema } from '../internal/standard-schema';

/** The operations a form writes. */
export type FormOperation = 'create' | 'update';

/**
 * What one member's input edits, from the member's input type: a boolean
 * `boolean | null`, `null` until it is set; an array `Array<string>`; a
 * string or a number `string`, the text its input holds; anything else
 * `unknown`, a JSON value or a codec's as it is.
 */
export type FormValue<TInput = unknown> = unknown extends TInput
  ? unknown
  : [NonNullable<TInput>] extends [never]
    ? unknown
    : [NonNullable<TInput>] extends [boolean]
      ? boolean | null
      : [NonNullable<TInput>] extends [ReadonlyArray<unknown>]
        ? Array<string>
        : [NonNullable<TInput>] extends [string | number]
          ? string
          : unknown;

/** The input type of `resource.write[operation]`: `{ attributes, relationships }`. */
type WriteInput<
  TResource,
  TOperation extends FormOperation,
> = TResource extends {
  readonly write: { readonly [K in TOperation]: infer TValidator };
}
  ? TValidator extends {
      readonly '~standard': { readonly types?: infer TTypes };
    }
    ? NonNullable<TTypes> extends { readonly input: infer TInput }
      ? TInput
      : never
    : never
  : never;

type PartOf<TInput, TPart extends string> = TInput extends {
  readonly [K in TPart]: infer TMembers;
}
  ? TMembers
  : never;

/** A field's codec, whose schema owns its value: its value is `unknown` whatever the codec's type. */
type CodecOf<
  TResource extends DeclaredShape,
  TName,
> = TName extends keyof TResource['fields']
  ? TResource['fields'][TName]['codec']
  : null;

/** Every member the operation writes, by public name, with its form value. */
type MemberValues<
  TResource extends DeclaredShape,
  TOperation extends FormOperation,
> = {
  readonly [
    K in keyof PartOf<WriteInput<TResource, TOperation>, 'attributes'> & string
  ]-?: CodecOf<TResource, K> extends string
    ? unknown
    : FormValue<PartOf<WriteInput<TResource, TOperation>, 'attributes'>[K]>;
} & {
  readonly [
    K in keyof PartOf<WriteInput<TResource, TOperation>, 'relationships'> &
      string
  ]-?: string;
};

/** Whether TypeScript knows the resource's members by name. */
type IsWide<TResource extends DeclaredShape> =
  string extends keyof TResource['fields'] ? true : false;

/** The public names of the members the operation writes (SPEC 9.4). */
export type FormMemberName<
  TResource extends DeclaredShape,
  TOperation extends FormOperation,
> =
  IsWide<TResource> extends true
    ? string
    : keyof MemberValues<TResource, TOperation> & string;

/** A form's values: one per member it holds, as its input edits it. */
export type FormValues<
  TResource extends DeclaredShape,
  TOperation extends FormOperation,
  TName extends string = FormMemberName<TResource, TOperation>,
> =
  IsWide<TResource> extends true
    ? Readonly<Record<string, unknown>>
    : {
        readonly [
          K in TName & keyof MemberValues<TResource, TOperation>
        ]: MemberValues<TResource, TOperation>[K];
      };

/** The JSON:API definition of a declared resource. */
type DefinitionOf<TResource> = TResource extends {
  readonly resource: infer TDefinition;
}
  ? TDefinition
  : never;

/** What `write` returns: the input of the client's `create` or `update` (jsonapi SPEC 15.4). */
export type FormWriteOf<
  TResource,
  TOperation extends FormOperation,
> = TOperation extends 'create'
  ? CreateInput<DefinitionOf<TResource>>
  : UpdateInput<DefinitionOf<TResource>>;

/** A refused write's texts (SPEC 20.4): one per member the server refused, and the rest for a banner. */
export interface FormErrors<TName extends string = string> {
  readonly fields: Readonly<Partial<Record<TName, string>>>;
  readonly form: ReadonlyArray<string>;
}

/** A record as the client reads it (jsonapi SPEC 15.6): its members by public name. */
export type FormRecord = Readonly<Record<string, unknown>>;

/**
 * The options of `resourceForm`: the application's messages, the record
 * an update edits, and the members the form holds, every one the
 * operation writes by default.
 */
export type FormModelOptions<
  TOperation extends FormOperation,
  TName extends string = string,
> = {
  readonly messages: Messages;
  readonly members?: ReadonlyArray<TName> | undefined;
} & (TOperation extends 'update'
  ? { readonly record: FormRecord }
  : { readonly record?: undefined });

/** A form over one operation of a declared resource (SPEC 20.3). */
export interface FormModel<TValues extends object, TWrite> {
  readonly type: string;
  readonly operation: FormOperation;
  /** The members the form holds, in declaration order, each `required` as the operation requires it. */
  readonly fields: ReadonlyArray<FieldDescriptor<keyof TValues & string>>;
  /** What the form starts from; frozen. */
  readonly defaultValues: TValues;
  /** A synchronous Standard Schema of the values: the operation's write validator over the write they make. */
  readonly validator: SyncStandardSchema<TValues>;
  /** The write `values` make; a `TypeError` for values the validator refuses. */
  readonly write: (values: TValues) => TWrite;
  /** A refused write's error objects by the field each points at. */
  readonly errors: (error: unknown) => FormErrors<keyof TValues & string>;
}
