/**
 * `relationshipTargets(resource, write, { pointer })` (SPEC 9.5, 12.3): the
 * rows a create's or an update's relationships name, which the runtime
 * looks up in the actor's scope before the write. PostgreSQL checks a
 * foreign key without row security, so a reference to another scope's row
 * passes it, and only a missing row fails it; a target the lookup does not
 * find answers as the foreign key answers a missing one, the
 * relationship's `foreignKey` code with its item at the relationship, so a
 * client cannot tell the two apart. A null target clears the relationship
 * and names no row. A foreign key PostgreSQL does not enforce has no code
 * (catalog ADR 0010) and accepts any target, so it names none here either.
 * A create may name the row it creates, which the foreign key accepts,
 * since it checks the reference once the row is inserted.
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html ("Referential integrity checks, such as unique or primary key constraints and foreign key references, always bypass row security")
 * @ref https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-FK
 * @packageDocumentation
 */
import type { BanError } from '@nizam-os/ban-core';

import type {
  AnyDeclaredResource,
  DeclaredInternals,
  DeclaredResource,
} from '../declare/declared-resource';
import type { ErrorEntry } from '../errors/error-entry';
import type { StorageWrite } from './storage';

import { internalsOf } from '../declare/declared-resource';
import { ownValue } from '../internal/object';
import { codeError } from './code-error';
import { pointerTokens } from './member-items';

/** A row a write's relationship names (SPEC 12.3). */
export interface RelationshipTarget {
  /** The relationship's public name. */
  readonly relationship: string;
  /** The declared resource the relationship's foreign key references. */
  readonly resource: DeclaredResource;
  /** The target's id, as the write carries it. */
  readonly id: string;
  /** What the foreign key raises for a target that does not exist (SPEC 9.5), to answer when the lookup finds none. */
  readonly error: BanError;
}

/** Where the write's resource object sits in the request document. */
export interface RelationshipTargetsOptions {
  /** The RFC 6901 pointer of the operation's resource object; default `/data`. */
  readonly pointer?: string | undefined;
}

const CALLER = 'relationshipTargets';
const DEFAULT_POINTER = '/data';

/** The code of the enforced foreign key on `column` and its entry, or `undefined` when there is none. */
function foreignKeyCode(
  internals: DeclaredInternals,
  column: string,
): { readonly code: string; readonly entry: ErrorEntry } | undefined {
  const { resource, catalog } = internals;
  const table = ownValue(catalog.tables, resource.table);
  const [name] =
    Object.entries(table?.constraints ?? {}).find(
      ([, constraint]) =>
        constraint.kind === 'foreignKey' &&
        constraint.enforced &&
        constraint.columns.length === 1 &&
        constraint.columns[0] === column,
    ) ?? [];
  const code = name === undefined ? undefined : resource.names.rules.get(name);
  const entry =
    code === undefined ? undefined : ownValue(resource.errors, code);
  return code === undefined || entry?.kind !== 'foreignKey'
    ? undefined
    : { code, entry };
}

/**
 * The rows the relationships of `write` name on `resource`, each with the
 * declared resource it belongs to and the error to answer when the
 * runtime does not find it, in the order the write carries them. Leaves
 * out a null target, one whose foreign key PostgreSQL does not enforce,
 * and a create's reference to its own id. Throws `TypeError` for a
 * resource `declareResource` did not return, a relationship it does not
 * have, and a pointer that is not an RFC 6901 JSON Pointer.
 */
export function relationshipTargets(
  resource: AnyDeclaredResource,
  write: StorageWrite,
  options: RelationshipTargetsOptions = {},
): ReadonlyArray<RelationshipTarget> {
  const internals = internalsOf(resource);
  if (internals === undefined) {
    throw new TypeError(
      `${CALLER}: the resource must be a resource declareResource returned`,
    );
  }
  const base = pointerTokens(options.pointer ?? DEFAULT_POINTER);
  if (base === undefined) {
    throw new TypeError(
      `${CALLER}: options.pointer must be an RFC 6901 JSON Pointer`,
    );
  }
  const declared = internals.resource;
  const targets: Array<RelationshipTarget> = [];
  for (const [relationship, id] of Object.entries(write.relationships)) {
    const spec = internals.specs.relationships.find(
      (candidate) => candidate.name === relationship,
    );
    if (spec === undefined) {
      throw new TypeError(
        `${CALLER}: ${declared.names.type} has no relationship "${relationship}"`,
      );
    }
    const target = spec.target();
    const foreignKey = foreignKeyCode(internals, spec.column);
    if (
      id === null ||
      foreignKey === undefined ||
      (target === declared && id === write.id)
    ) {
      continue;
    }
    const { code, entry } = foreignKey;
    targets.push({
      relationship,
      resource: target,
      id,
      error: codeError(declared, code, entry, base),
    });
  }
  return targets;
}
