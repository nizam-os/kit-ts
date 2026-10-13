import type { output } from 'zod/v4/core';

/**
 * What a domain CHECK's validator receives, in types (SPEC 3.6, 6.1 step
 * 5): the domain's value through its wire form, the output of each codec
 * that attaches to the domain or to a domain over it (a codec keeps the
 * validators of the domains above the column's first array), and `null`
 * unless the domain or a base domain forbids it. The definer cannot see
 * which columns use a domain, so it assumes a nullable one: a domain only
 * NOT NULL columns use still needs a validator that accepts `null`.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { TypedRecord } from '../catalog/resolve-type';
import type { CodecRegistry } from '../declare/registries';
import type { TopDomains } from './member-types';
import type { ColumnValue } from './value-types';

/** A column of the domain: the record its value and facts are read from. */
interface DomainColumn<TDomain extends string> {
  readonly type: TDomain;
  readonly typeKind: 'domain';
  readonly array: false;
}

/** The domains a value of `TRecord` passes before its first array; a cycle stops where it repeats. */
type ScalarChain<
  TCatalog extends PublicCatalog,
  TRecord extends TypedRecord,
  TSeen extends string = never,
> = TRecord['array'] extends true
  ? TSeen
  : TRecord['typeKind'] extends 'domain'
    ? TRecord['type'] extends TSeen
      ? TSeen
      : TRecord['type'] extends keyof TCatalog['domains']
        ? ScalarChain<
            TCatalog,
            TCatalog['domains'][TRecord['type']],
            TSeen | TRecord['type']
          >
        : TSeen
    : TSeen;

/** The domains whose columns run the validators of `TDomain`: it, and each domain over it before an array. */
type DomainsOver<TCatalog extends PublicCatalog, TDomain extends string> = {
  [D in keyof TCatalog['domains'] & string]: TDomain extends ScalarChain<
    TCatalog,
    DomainColumn<D>
  >
    ? D
    : never;
}[keyof TCatalog['domains'] & string];

/** The outputs of the codecs whose `types` name one of `TTypes`. */
type CodecOutput<TCodecs extends CodecRegistry, TTypes extends string> = {
  [C in keyof TCodecs]: [Extract<TCodecs[C]['types'][number], TTypes>] extends [
    never,
  ]
    ? never
    : output<TCodecs[C]['schema']>;
}[keyof TCodecs];

/** What the validator of a CHECK of domain `TDomain` receives. */
export type DomainInput<
  TCatalog extends PublicCatalog,
  TCodecs extends CodecRegistry,
  TDomain extends string,
> =
  | ColumnValue<TCatalog, DomainColumn<TDomain>>
  | CodecOutput<TCodecs, DomainsOver<TCatalog, TDomain>>
  | (TopDomains<TCatalog, DomainColumn<TDomain>> extends {
      readonly notNull: true;
    }
      ? never
      : null);
