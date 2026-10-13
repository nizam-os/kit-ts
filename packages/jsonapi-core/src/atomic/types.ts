/**
 * Public types of the Atomic Operations extension support (SPEC 11). The
 * processor is framework-free: `TContext` is whatever the host hands to
 * `operationsProcessor` per request (the Hono `Context` under
 * `@nizam-os/hono-jsonapi`, a `Request` in a plain fetch handler, nothing at all in a
 * test) and reaches every handler as `ctx`.
 * @ref https://jsonapi.org/ext/atomic/
 * @packageDocumentation
 */
import type {
  Meta,
  ResourceIdentifier,
  ResourceLinkage,
} from '../document/types';
import type {
  AnyResource,
  CreateAttributesOf,
  RelationshipNameOf,
  RowOf,
  UpdateAttributesOf,
} from '../resource/types';

export type OperationCode = 'add' | 'update' | 'remove';

/** Handlers may be synchronous; the processor awaits either way. */
export type MaybePromise<T> = T | Promise<T>;

/** What an operation targets, from `ref` or a resolved `href`. */
export interface OperationTarget {
  readonly type: string;
  readonly id?: string | undefined;
  readonly lid?: string | undefined;
  readonly relationship?: string | undefined;
}

/**
 * A resource object from an operation's `data` once every `lid` has been
 * replaced by the id the earlier operation produced.
 */
export interface ResolvedResourceObject<TAttributes> {
  readonly type: string;
  readonly id: string | undefined;
  readonly lid: string | undefined;
  readonly attributes: TAttributes;
  readonly relationships: Readonly<Record<string, ResourceLinkage>>;
  readonly meta: Meta | undefined;
}

/** What every handler receives besides its input. */
export interface OperationContext<TTransaction, TContext = unknown> {
  /** What the host passed to the processor for this request. */
  readonly ctx: TContext;
  readonly tx: TTransaction;
  /** Position in `atomic:operations`. */
  readonly index: number;
  /** JSON Pointer of the operation, for errors a handler builds itself. */
  readonly pointer: string;
  /** The operation's `meta` member. */
  readonly meta: Meta | undefined;
}

export interface RelationshipHandlers<TTransaction, TContext = unknown> {
  /** `update`: an identifier or `null` for to-one, the full membership for to-many. */
  readonly update?:
    | ((
        input: { readonly id: string; readonly data: ResourceLinkage },
        context: OperationContext<TTransaction, TContext>,
      ) => MaybePromise<void>)
    | undefined;
  /** `add` to a to-many relationship. */
  readonly add?:
    | ((
        input: {
          readonly id: string;
          readonly data: ReadonlyArray<ResourceIdentifier>;
        },
        context: OperationContext<TTransaction, TContext>,
      ) => MaybePromise<void>)
    | undefined;
  /** `remove` from a to-many relationship. */
  readonly remove?:
    | ((
        input: {
          readonly id: string;
          readonly data: ReadonlyArray<ResourceIdentifier>;
        },
        context: OperationContext<TTransaction, TContext>,
      ) => MaybePromise<void>)
    | undefined;
}

/**
 * The operations one resource type supports. A handler that is absent makes
 * the operation a 403; a returned row becomes the result's `data`, and
 * `undefined` an empty result.
 */
export interface ResourceHandlers<
  TResource extends AnyResource,
  TTransaction,
  TContext = unknown,
> {
  readonly resource: TResource;
  readonly create?:
    | ((
        input: {
          readonly data: ResolvedResourceObject<CreateAttributesOf<TResource>>;
        },
        context: OperationContext<TTransaction, TContext>,
      ) => MaybePromise<RowOf<TResource> | undefined>)
    | undefined;
  readonly update?:
    | ((
        input: {
          readonly id: string;
          readonly data: ResolvedResourceObject<UpdateAttributesOf<TResource>>;
        },
        context: OperationContext<TTransaction, TContext>,
      ) => MaybePromise<RowOf<TResource> | undefined>)
    | undefined;
  readonly remove?:
    | ((
        input: { readonly id: string },
        context: OperationContext<TTransaction, TContext>,
      ) => MaybePromise<void>)
    | undefined;
  readonly relationships?:
    | {
        readonly [
          TName in RelationshipNameOf<TResource>
        ]?: RelationshipHandlers<TTransaction, TContext>;
      }
    | undefined;
}

/**
 * A handler type whose parameters are compared bivariantly: the function
 * type is read off a method signature, and method parameters are exempt
 * from strict function type checking. `ResourceHandlers` written against a
 * definition's attribute types are then assignable where attributes are
 * `unknown`, which is how the processor stores them.
 * @ref https://www.typescriptlang.org/tsconfig/#strictFunctionTypes
 */
type ErasedHandler<TInput, TTransaction, TContext, TResult> = {
  bivariant(
    input: TInput,
    context: OperationContext<TTransaction, TContext>,
  ): MaybePromise<TResult>;
}['bivariant'];

/** `ResourceHandlers` for any definition, as the processor stores them. */
export interface AnyResourceHandlers<TTransaction, TContext = unknown> {
  readonly resource: AnyResource;
  readonly create?:
    | ErasedHandler<
        { readonly data: ResolvedResourceObject<unknown> },
        TTransaction,
        TContext,
        unknown
      >
    | undefined;
  readonly update?:
    | ErasedHandler<
        {
          readonly id: string;
          readonly data: ResolvedResourceObject<unknown>;
        },
        TTransaction,
        TContext,
        unknown
      >
    | undefined;
  readonly remove?:
    | ErasedHandler<{ readonly id: string }, TTransaction, TContext, void>
    | undefined;
  readonly relationships?:
    | Readonly<
        Record<string, RelationshipHandlers<TTransaction, TContext> | undefined>
      >
    | undefined;
}

export interface AtomicOptions<TTransaction, TContext = unknown> {
  /** One entry per resource type operations may target. */
  readonly resources: ReadonlyArray<
    AnyResourceHandlers<TTransaction, TContext>
  >;
  /**
   * Runs every operation of a request inside one unit of work: `run` is
   * called once, and its rejection MUST roll back whatever it did. `ctx` is
   * what the host passed to the processor for this request.
   */
  readonly transaction: <T>(
    ctx: TContext,
    run: (tx: TTransaction) => Promise<T>,
  ) => Promise<T>;
  /**
   * Resolves an operation's `href` to a target. Without it, `href` is
   * rejected: the extension leaves `href` optional for servers.
   */
  readonly resolveHref?:
    | ((href: string) => OperationTarget | undefined)
    | undefined;
}
