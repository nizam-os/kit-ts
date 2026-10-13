import type { input } from 'zod/v4/core';

/**
 * The type-level check of the definer's `domains` (SPEC 3.6): each key is a
 * domain of the catalog and each constraint one of its CHECKs; a CHECK
 * without a rule names a validator of the registry whose input accepts
 * what the domain's columns hold (SPEC 7.2), a CHECK with a rule names
 * none, and each given code is a code. The runtime twin is `checkDomains`
 * in `check-config.ts`.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicDomain } from '@nizam-os/catalog-core';

import type { IsCode } from '../names/code';
import type { DomainInput } from '../schema/domain-input';
import type {
  CodecRegistry,
  DomainRule,
  DomainRules,
  ValidatorRegistry,
} from './registries';
import type { Requirement } from './requirement';
import type { MemberOf } from './types';

type UntranslatedDomainCheck<TDomain extends PublicDomain> = {
  [K in keyof TDomain['constraints']]: TDomain['constraints'][K] extends {
    readonly rule: null;
  }
    ? K
    : never;
}[keyof TDomain['constraints']];

/**
 * A given `code` held to `CODE_PATTERN`, reported as a `Requirement` at the
 * rule; a derived one is checked at runtime (SPEC 4.2).
 */
type GivenDomainCode<TRule> = TRule extends {
  readonly code: infer TCode extends string;
}
  ? IsCode<TCode> extends true
    ? unknown
    : Requirement<`code: "${TCode}" is not A-Z, 0-9, _`>
  : unknown;

/**
 * The requirement that the entry of a CHECK without a rule name a
 * validator whose input accepts every value of the domain. A wrong name is
 * a `Requirement` too, not a narrower `validator` type: the rule's literal
 * would intersect with it and reduce to `never`, hiding the message
 * (`requirement.ts`).
 */
type DomainValidatorRequirement<
  TCatalog extends PublicCatalog,
  TCodecs extends CodecRegistry,
  TValidators extends ValidatorRegistry,
  TDomain extends string,
  TValidator,
> = [TValidator] extends [undefined]
  ? Requirement<'validator: a CHECK without a rule needs a validator'>
  : TValidator extends keyof TValidators & string
    ? [DomainInput<TCatalog, TCodecs, TDomain>] extends [
        input<TValidators[TValidator]['schema']>,
      ]
      ? unknown
      : Requirement<`validator: "${TValidator}" does not accept every value of domain ${TDomain}`>
    : Requirement<`validator: "${TValidator & string}" is not a validator of createDeclareResource`>;

/** The entry of a CHECK with a rule gives its code alone: the rule enforces the CHECK already. */
type RuledEntryRequirement<TValidator> = [TValidator] extends [undefined]
  ? unknown
  : Requirement<'validator: the CHECK has a rule, which enforces it already'>;

/** `domains`, key by key. */
export interface DomainsCheck<
  TCatalog extends PublicCatalog,
  TCodecs extends CodecRegistry,
  TValidators extends ValidatorRegistry,
  TDomains extends DomainRules,
> {
  readonly domains?:
    | {
        readonly [D in keyof TDomains]: D extends keyof TCatalog['domains']
          ? {
              readonly [
                K in keyof TDomains[D]
              ]: K extends keyof TCatalog['domains'][D]['constraints']
                ? DomainRule &
                    GivenDomainCode<TDomains[D][K]> &
                    (K extends UntranslatedDomainCheck<TCatalog['domains'][D]>
                      ? DomainValidatorRequirement<
                          TCatalog,
                          TCodecs,
                          TValidators,
                          D & string,
                          MemberOf<TDomains[D][K], 'validator'>
                        >
                      : RuledEntryRequirement<
                          MemberOf<TDomains[D][K], 'validator'>
                        >)
                : `${K & string} is not a CHECK of domain ${D & string}`;
            }
          : `"${D & string}" is not a domain of the public catalog`;
      }
    | undefined;
}
