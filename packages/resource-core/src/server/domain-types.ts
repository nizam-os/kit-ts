/**
 * The application's domain as the server's definers read it (SPEC 12.1):
 * the actor, the permission and quota names, the services a runtime hands
 * to policies, rules, and effects, and the application's error codes. The
 * definers take it as a type argument and nothing else.
 * @packageDocumentation
 */
import type { Catalog } from '@nizam-os/ban-core';

/**
 * Who runs an operation. Declare the application's actor as
 * `interface AppActor extends Actor<Permission>`, so `can` refuses a
 * permission the domain does not have. `can` is a property, so TypeScript
 * compares two actors' permissions contravariantly.
 */
export interface Actor<TPermission extends string = string> {
  readonly id: string;
  readonly can: (permission: TPermission) => boolean;
}

/** What `createDomainDefiners` takes as its type argument. */
export interface DomainShape {
  readonly actor: Actor<never>;
  /** A union of permission strings. */
  readonly permissions: string;
  /** A union of quota names; `never` without quotas. */
  readonly quotas: string;
  /** What the runtime hands to policies, rules, and effects. */
  readonly services: unknown;
  /** The application's `@nizam-os/ban-core` catalog fragment. */
  readonly errors: Catalog;
}

/** The constraint of a domain: its actor can check each of its permissions. */
export type DomainOf<TDomain extends DomainShape> = DomainShape & {
  readonly actor: Actor<TDomain['permissions']>;
};

/** What every policy, rule, and effect receives. */
export interface DomainContext<TDomain extends DomainShape> {
  readonly actor: TDomain['actor'];
  readonly services: TDomain['services'];
}

/** The application's codes, which `reject` takes. */
export type AppCodeOf<TDomain extends DomainShape> = keyof TDomain['errors'] &
  string;
