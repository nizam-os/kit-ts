/**
 * The keys of the Kysely types under `camelCase` (SPEC 9.2): the names
 * Kysely's CamelCasePlugin gives tables and columns, through the core's
 * port of its conversions, and the names the plugin would not map back.
 * @ref https://kysely.dev/docs/plugins#camel-case-plugin
 * @packageDocumentation
 */
import type { CamelCaseOptions } from '@nizam-os/catalog-core';

import { toCamelCase, toSnakeCase } from '@nizam-os/catalog-core';

import { PgCatalogError } from '../errors';

/**
 * The keys of the Kysely types: database names as they are, or with
 * `camelCase` the names CamelCasePlugin gives them. A name the plugin would
 * not turn back into itself is collected, and `assertMapped` reports every
 * one in a single `camel_case_mismatch`.
 */
export class KeyNames {
  private readonly options: CamelCaseOptions | null;
  private readonly mismatches: Array<string> = [];

  public constructor(camelCase: boolean | CamelCaseOptions | undefined) {
    this.options =
      camelCase === undefined || camelCase === false
        ? null
        : camelCase === true
          ? {}
          : camelCase;
  }

  /** The key of a table or column; `owner` describes it in the error. */
  public key(name: string, owner: string): string {
    if (this.options === null) {
      return name;
    }
    const key = toCamelCase(name, this.options);
    const back = toSnakeCase(key, this.options);
    if (back !== name) {
      this.mismatches.push(
        `${owner} becomes ${key} in camelCase, which CamelCasePlugin turns back into ${back}`,
      );
    }
    return key;
  }

  /** Throws one `camel_case_mismatch` listing every name that failed, in the order seen. */
  public assertMapped(): void {
    if (this.mismatches.length > 0) {
      throw new PgCatalogError(
        'camel_case_mismatch',
        this.mismatches.join('; '),
      );
    }
  }
}
