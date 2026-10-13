/**
 * `MessagesFor<TResources, TApp>` (SPEC 10.1), the type of the messages of
 * a list of resources: a title and detail for every code a response can
 * carry that no resource derives, `@nizam-os/jsonapi-core`'s, resource-core's
 * `QUOTA_EXCEEDED`, and the application's; optional texts for the derived
 * codes and the other `@nizam-os/ban-core` built-ins; one title and detail
 * per constraint kind the derived codes have; a message per issue kind; a
 * label per public member of each resource; and a label per option of each
 * field that has options. Each message is a function typed with the inputs
 * its kind receives, so a message that needs an input its kind does not
 * have, or a title or label that needs any, fails `tsc`. A resource whose
 * table TypeScript does not know makes its parts open records, which
 * `defineMessages` checks at runtime.
 * @packageDocumentation
 */
import type { BuiltinKey, Catalog, EmptyCatalog } from '@nizam-os/ban-core';
import type { ErrorCode } from '@nizam-os/jsonapi-core';

import type { AnyDeclaredResource } from '../declare/declared-resource';
import type { DeclareContext } from '../declare/registries';
import type { Declaration } from '../declare/types';
import type { ErrorEntry } from '../errors/error-entry';
import type { QuotaExceededCatalog } from '../errors/quota-exceeded';
import type { TypedFieldOptions } from '../meta/field-meta-types';
import type { TypeNameOf } from '../names/public-names';
import type { IssueKind } from '../schema/issue-kinds';
import type { TableDefOf } from '../schema/resource-types';
import type {
  CodeInputs,
  ConstraintInputs,
  ErrorText,
  IssueInputs,
  Label,
  Message,
} from './types';

type Simplify<TValue> = { readonly [K in keyof TValue]: TValue[K] };

/** The intersection of a union's members. */
type Intersect<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TAll) => void
  ? TAll
  : never;

/** A resource's public type; `string` when TypeScript does not know its table. */
type TypeOf<TResource> = TResource extends {
  readonly table: infer TTable extends string;
  readonly declaration: infer TDecl extends Declaration;
  readonly '~context'?: infer TContext;
}
  ? string extends TTable
    ? string
    : NonNullable<TContext> extends infer TDefined extends DeclareContext
      ? TypeNameOf<TableDefOf<TDefined, TTable>, TDecl>
      : string
  : string;

type ErrorsOf<TResource> = TResource extends {
  readonly errors: infer TErrors extends Readonly<Record<string, ErrorEntry>>;
}
  ? TErrors
  : never;

/** The codes the resources derive, one union over all of them. */
type DerivedOf<TResource> = TResource extends unknown
  ? keyof ErrorsOf<TResource> & string
  : never;

/** The constraint kinds of the codes the resources derive. */
type KindsOf<TResource> = TResource extends unknown
  ? ErrorsOf<TResource>[keyof ErrorsOf<TResource>]['kind']
  : never;

/** The codes no resource derives, each of which needs a title and a detail. */
type CodesOf<TApp> =
  | ErrorCode
  | keyof QuotaExceededCatalog
  | (keyof TApp & string);

type MembersOf<TResource> = TResource extends {
  readonly fields: infer TFields;
}
  ? keyof TFields & string
  : never;

type FieldLabels<TResource> = TResource extends unknown
  ? {
      readonly [K in TypeOf<TResource>]: {
        readonly [M in MembersOf<TResource>]: Label;
      };
    }
  : never;

/** The fields that have options, each to a label per option. */
type OptionFields<TValues> = {
  readonly [K in keyof TValues as [TValues[K]] extends [never] ? never : K]: {
    readonly [V in TValues[K] & string]: Label;
  };
};

type AnyOptions = {
  readonly [type: string]: {
    readonly [field: string]: { readonly [option: string]: Label };
  };
};

/**
 * A resource's option labels under its type; `never` for a resource without
 * options, which drops it from the union. The values come from
 * `TypedFieldOptions`, not from `fields`, whose full metadata made a full
 * mapping over stern's declarations cost a third more to check (SPEC 15.5).
 */
type OptionLabels<TResource> = TResource extends {
  readonly table: infer TTable extends string;
  readonly declaration: infer TDecl extends Declaration;
  readonly '~context'?: infer TContext;
}
  ? string extends TTable
    ? AnyOptions
    : NonNullable<TContext> extends infer TDefined extends DeclareContext
      ? OptionFields<
          TypedFieldOptions<TDefined, TTable, TDecl>
        > extends infer TFields
        ? [keyof TFields] extends [never]
          ? never
          : { readonly [K in TypeOf<TResource>]: TFields }
        : never
      : AnyOptions
  : never;

/** The options section when no field has options: empty, so any key fails. */
type NoOptions = { readonly [type: string]: never };

type OptionsOf<TResource> = [OptionLabels<TResource>] extends [never]
  ? NoOptions
  : Simplify<Intersect<OptionLabels<TResource>>>;

/** The messages `defineMessages` takes and returns for `TResources` and `TApp`. */
export interface MessagesFor<
  TResources extends ReadonlyArray<AnyDeclaredResource>,
  TApp extends Catalog = EmptyCatalog,
> {
  readonly errors: {
    readonly [K in CodesOf<TApp>]: ErrorText<CodeInputs>;
  } & {
    readonly [
      K in Exclude<DerivedOf<TResources[number]>, CodesOf<TApp>>
    ]?: ErrorText<ConstraintInputs>;
  } & {
    readonly [
      K in Exclude<BuiltinKey, CodesOf<TApp> | DerivedOf<TResources[number]>>
    ]?: ErrorText<CodeInputs>;
  };
  readonly constraints: {
    readonly [K in KindsOf<TResources[number]>]: ErrorText<ConstraintInputs>;
  };
  readonly validation: {
    readonly [K in IssueKind]: Message<IssueInputs[K]>;
  };
  readonly fields: Simplify<Intersect<FieldLabels<TResources[number]>>>;
  readonly options: OptionsOf<TResources[number]>;
}
