/**
 * Records (SPEC 15.6, ADR 0019): the plain objects `deserialize` makes of
 * a document's resource objects, and what it returns. The members a
 * record keeps of its resource object take a `$`, a character no member
 * name may contain, so no field collides with them.
 * @ref https://jsonapi.org/format/1.1/#document-resource-objects
 * @ref https://jsonapi.org/format/1.1/#document-member-names-reserved-characters
 * @packageDocumentation
 */
import type {
  JsonApiObject,
  Links,
  Meta,
  Relationships,
} from '@nizam-os/jsonapi-core';

/** A resource identifier as a record's linkage holds it. */
export interface Identifier<TType extends string = string> {
  readonly type: TType;
  readonly id: string;
}

/** What a record keeps of its resource object, each only when the object has it. */
export interface RecordMembers {
  /** The resource object's `links`. */
  readonly $links?: Links;
  /** The resource object's `meta`. */
  readonly $meta?: Meta;
  /** Each relationship object as sent: its `links`, `data`, and `meta`. */
  readonly $relationships?: Relationships;
}

/** A record typed wide, as of a type the client has no definition of: each field `unknown`. */
export interface AnyRecord extends RecordMembers {
  readonly type: string;
  readonly id: string;
  readonly [field: string]: unknown;
}

/** What `deserialize` returns. */
export interface Deserialized<
  TData = AnyRecord | ReadonlyArray<AnyRecord> | null | undefined,
> {
  /** A record, `null`, or a list of records; `undefined` when the document has no `data`. */
  readonly data: TData;
  /** Every included resource as a record holding its linkage. */
  readonly included: ReadonlyArray<AnyRecord>;
  readonly links: Links | undefined;
  readonly meta: Meta | undefined;
  readonly jsonapi: JsonApiObject | undefined;
}

export interface DeserializeOptions {
  /** The include paths the request sent: the relationships on them resolve into records. */
  readonly include?: ReadonlyArray<string> | undefined;
}
