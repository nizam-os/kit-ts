import type { BanError } from '../core/ban-error';
import type { ResolvedDefinition } from '../core/definition';
import type { ErrorItem } from '../core/error-item';
import type { JsonSchema, RenderContext, SchemaContext } from './context';

/**
 * A wire format owns both rendering and the JSON Schema that describes what
 * it renders (ADR 0003). Formats are pure: same inputs, same body.
 */
export interface ErrorFormat<TBody = unknown> {
  readonly name: string;
  readonly contentType: string;
  /** Renders an error without a list (`error.errors` is `undefined`). */
  render(error: BanError, ctx: RenderContext): TBody;
  /** Renders an error with its list, which may be empty (SPEC 7). */
  renderErrors(
    error: BanError,
    errors: ReadonlyArray<ErrorItem>,
    ctx: RenderContext,
  ): TBody;
  schema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
  /** Schema of `renderErrors` bodies for the entry; `validationSchema()` in `@nizam-os/ban-core/openapi` reads it. */
  errorsSchema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
  /**
   * Present on a format whose `renderErrors` gives each item its own
   * identity, so one body can combine entries (SPEC 7.2.4): the schema of a
   * body whose objects each carry the identity of one of `definitions`,
   * each object a `{ $ref: ctx.objectRef(key) }` when `ctx.objectRef` is
   * set. `errorResponses()` in `@nizam-os/ban-core/openapi` reads it.
   */
  mixedSchema?(
    definitions: ReadonlyArray<ResolvedDefinition>,
    ctx: SchemaContext,
  ): JsonSchema;
  /**
   * The object of `definition` in the bodies `mixedSchema` describes, the
   * schema `ctx.objectRef` points at. `errorObjectSchemas()` in
   * `@nizam-os/ban-core/openapi` reads it.
   */
  objectSchema?(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
}
