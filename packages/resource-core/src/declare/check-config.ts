/**
 * The definer's runtime checks (SPEC 2): what TypeScript cannot see, and
 * every mistake made from JavaScript, throws `TypeError` when
 * `createDeclareResource` runs.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type {
  DefineResource,
  PageCapabilitiesInit,
} from '@nizam-os/jsonapi-core';

import type { Codec, Validator } from '../codecs/types';
import type {
  CodecRegistry,
  DomainRule,
  DomainRules,
  ScopeColumn,
  ScopeRegistry,
  ValidatorRegistry,
} from './registries';

import { CATALOG_FORMAT } from '@nizam-os/catalog-core';
import { createDefineResource } from '@nizam-os/jsonapi-core';

import { isCodec } from '../codecs/define-codec';
import { isValidator } from '../codecs/define-validator';
import {
  expectKnownKeys,
  expectRecord,
  expectRegistry,
} from '../internal/expect';
import { describe, ownValue } from '../internal/object';
import { deriveCode, isCode } from '../names/code';
import { checkPageInit, mergePage } from './check-page';

const DEFINER = 'createDeclareResource';
const CONFIG_KEYS: ReadonlyArray<string> = [
  'catalog',
  'codecs',
  'validators',
  'scopes',
  'domains',
  'links',
  'page',
  'atomic',
];

/** The definer's configuration after its checks, shared by every declaration. */
export interface DefinerContext {
  readonly catalog: PublicCatalog;
  readonly codecs: CodecRegistry;
  readonly validators: ValidatorRegistry;
  readonly scopes: ScopeRegistry;
  readonly domains: DomainRules;
  /** `@nizam-os/jsonapi-core`'s `defineResource` with the definer's `links` and `atomic` (SPEC 11.1). */
  readonly defineResource: DefineResource;
  readonly page: PageCapabilitiesInit;
}

/** A registry the definer leaves out (`undefined`) is empty; `null` is refused like any other non-object. */
function optionalRegistry<TEntry>(
  name: string,
  value: unknown,
  check: (path: string, entry: unknown, name: string) => TEntry,
): Readonly<Record<string, TEntry>> {
  return expectRegistry(
    `${DEFINER}.${name}`,
    value === undefined ? {} : value,
    check,
  );
}

function checkCatalog(value: unknown): PublicCatalog {
  const path = `${DEFINER}.catalog`;
  const catalog = expectRecord(path, value);
  if (Object.hasOwn(catalog, 'schemas')) {
    throw new TypeError(
      `${path}: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers`,
    );
  }
  if (catalog['format'] !== CATALOG_FORMAT) {
    throw new TypeError(
      `${path}: format ${describe(catalog['format'])} is not supported (expected ${String(CATALOG_FORMAT)})`,
    );
  }
  for (const member of ['enums', 'domains', 'tables']) {
    expectRecord(`${path}.${member}`, catalog[member]);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the deeper shape is the generated module's (pg-catalog writes it and `extract --check` holds it to the database); the checks above catch what a caller gets wrong: a full catalog, another format, or a value that is not a catalog
  return catalog as unknown as PublicCatalog;
}

/** A codec registry entry: a value `defineCodec` returned (SPEC 2), which checked itself. */
function checkCodec(path: string, value: unknown): Codec {
  if (!isCodec(value)) {
    throw new TypeError(`${path}: must be made by defineCodec`);
  }
  return value;
}

/** A validator registry entry: a value `defineValidator` returned. */
function checkValidator(path: string, value: unknown): Validator {
  if (!isValidator(value)) {
    throw new TypeError(`${path}: must be made by defineValidator`);
  }
  return value;
}

function checkScope(path: string, value: unknown): ScopeColumn {
  const scope = expectRecord(path, value);
  expectKnownKeys(path, scope, ['column']);
  const column = scope['column'];
  if (typeof column !== 'string' || column === '') {
    throw new TypeError(
      `${path}.column: must be a column name, received ${describe(column)}`,
    );
  }
  return { column };
}

function checkDomainRule(
  path: string,
  value: unknown,
  [catalog, validators, domainName, constraintName]: readonly [
    PublicCatalog,
    ValidatorRegistry,
    string,
    string,
  ],
): DomainRule {
  const constraint = ownValue(
    ownValue(catalog.domains, domainName)?.constraints ?? {},
    constraintName,
  );
  if (constraint === undefined) {
    throw new TypeError(
      `${path}: "${constraintName}" is not a CHECK of domain ${domainName}`,
    );
  }
  const rule = expectRecord(path, value);
  expectKnownKeys(path, rule, ['validator', 'code']);
  const validator = rule['validator'];
  if (constraint.rule !== null) {
    if (validator !== undefined) {
      throw new TypeError(
        `${path}.validator: the CHECK has a rule, which enforces it already`,
      );
    }
    return checkDomainCode(path, rule['code'], constraintName);
  }
  if (validator === undefined) {
    throw new TypeError(
      `${path}.validator: a CHECK without a rule needs a validator`,
    );
  }
  if (
    typeof validator !== 'string' ||
    ownValue(validators, validator) === undefined
  ) {
    throw new TypeError(
      `${path}.validator: ${describe(validator)} is not a validator of ${DEFINER}`,
    );
  }
  return { validator, ...checkDomainCode(path, rule['code'], constraintName) };
}

/** A domain CHECK's code, given or derived from its name, must be a code (SPEC 4.2, 6.4). */
function checkDomainCode(
  path: string,
  code: unknown,
  constraintName: string,
): Pick<DomainRule, 'code'> {
  if (code === undefined) {
    const derived = deriveCode(constraintName);
    if (!isCode(derived)) {
      throw new TypeError(
        `${path}: code "${derived}" is not A-Z, 0-9, _; set code`,
      );
    }
    return {};
  }
  if (typeof code !== 'string' || !isCode(code)) {
    throw new TypeError(`${path}.code: ${describe(code)} is not A-Z, 0-9, _`);
  }
  return { code };
}

function checkDomains(
  value: unknown,
  catalog: PublicCatalog,
  validators: ValidatorRegistry,
): DomainRules {
  return optionalRegistry('domains', value, (path, rules, domainName) => {
    if (ownValue(catalog.domains, domainName) === undefined) {
      throw new TypeError(
        `${path}: "${domainName}" is not a domain of the public catalog`,
      );
    }
    return expectRegistry(path, rules, (rulePath, rule, constraintName) =>
      checkDomainRule(rulePath, rule, [
        catalog,
        validators,
        domainName,
        constraintName,
      ]),
    );
  });
}

/** An optional member that holds an object; only `undefined` means absent. */
function optionalRecord(
  name: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  return expectRecord(`${DEFINER}.${name}`, value === undefined ? {} : value);
}

/**
 * The definer of every declaration's JSON:API definition, configured with
 * `links` and `atomic`, which `@nizam-os/jsonapi-core` checks by its own
 * rules; the message gains the definer's prefix. A declaration has no
 * `atomic` of its own, so every definition carries the definer's cap.
 */
function definerOf(links: unknown, atomic: unknown): DefineResource {
  const defaults = {
    links: optionalRecord('links', links),
    atomic: optionalRecord('atomic', atomic),
  };
  expectKnownKeys(`${DEFINER}.atomic`, defaults.atomic, ['max']);
  try {
    return createDefineResource(defaults);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TypeError(`${DEFINER}.${error.message}`, { cause: error });
    }
    throw error;
  }
}

/** Checks the definer's configuration and returns what every declaration reads. */
export function checkDefinerConfig(value: unknown): DefinerContext {
  const config = expectRecord(DEFINER, value);
  expectKnownKeys(DEFINER, config, CONFIG_KEYS);
  const catalog = checkCatalog(config['catalog']);
  const validators = optionalRegistry(
    'validators',
    config['validators'],
    checkValidator,
  );
  const page = checkPageInit(`${DEFINER}.page`, config['page']);
  mergePage(`${DEFINER}.page`, page, {});
  return {
    catalog,
    codecs: optionalRegistry('codecs', config['codecs'], checkCodec),
    validators,
    scopes: optionalRegistry('scopes', config['scopes'], checkScope),
    domains: checkDomains(config['domains'], catalog, validators),
    defineResource: definerOf(config['links'], config['atomic']),
    page,
  };
}
