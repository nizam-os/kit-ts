/**
 * The CamelCasePlugin port of `@nizam-os/catalog-core` (SPEC 9.2) against
 * Kysely's own plugin, which a core cannot import, and the keys the Kysely
 * types get with `camelCase`: the plugin's names where they map back,
 * `camel_case_mismatch` where they do not.
 */
import type { CamelCaseOptions } from '@nizam-os/catalog-core';

import { CamelCasePlugin } from 'kysely';
import { describe, expect, it } from 'vitest';

import { toCamelCase, toSnakeCase } from '@nizam-os/catalog-core';

import { catalogOf, column, table } from '../test-support/kysely-catalog';
import { KeyNames } from './key-names';
import { renderKyselyTypes } from './kysely-types';

/** The plugin's conversions, through the methods its documentation says to override. */
class Plugin extends CamelCasePlugin {
  public snake(text: string): string {
    return this.snakeCase(text);
  }

  public camel(text: string): string {
    return this.camelCase(text);
  }
}

const OPTIONS: ReadonlyArray<CamelCaseOptions> = [
  {},
  { upperCase: true },
  { underscoreBeforeDigits: true },
  { underscoreBetweenUppercaseLetters: true },
  {
    upperCase: true,
    underscoreBeforeDigits: true,
    underscoreBetweenUppercaseLetters: true,
  },
];
const NAMES = [
  'first_name',
  'address_line_1',
  'user2fa',
  'HTTPStatus',
  'already_camelCase',
  '_leading',
  'trailing_',
  'double__under',
  'FIRST_NAME',
  'straße_name',
  'İstanbul_x',
  'café_au_lait',
  String.fromCodePoint(0x1_04_28, 0x5f, 0x78),
  'name with space',
];
const ALPHABET = ['a', 'B', '_', '1', 'ß'];
const LONGEST = 4;

/** Every string over the alphabet up to the longest length, the empty one included. */
function strings(): ReadonlyArray<string> {
  let level = [''];
  const all = [''];
  for (let length = 1; length <= LONGEST; length += 1) {
    level = level.flatMap((prefix) =>
      ALPHABET.map((letter) => `${prefix}${letter}`),
    );
    all.push(...level);
  }
  return all;
}

function mismatch(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (
      error instanceof Error &&
      Reflect.get(error, 'code') === 'camel_case_mismatch'
    ) {
      return error.message;
    }
    throw error;
  }
  throw new Error('expected a camel_case_mismatch');
}

describe('the CamelCasePlugin port', () => {
  it('converts every name exactly as Kysely does, under every option', () => {
    const differences: Array<string> = [];
    for (const options of OPTIONS) {
      const plugin = new Plugin(options);
      for (const name of [...NAMES, ...strings()]) {
        const ours = [toSnakeCase(name, options), toCamelCase(name, options)];
        const kysely = [plugin.snake(name), plugin.camel(name)];
        if (ours.join('\n') !== kysely.join('\n')) {
          differences.push(
            `${JSON.stringify(name)} ${JSON.stringify(options)}`,
          );
        }
      }
    }
    expect(differences).toEqual([]);
  });
});

describe('KeyNames', () => {
  it('keeps database names when camelCase is off', () => {
    const names = new KeyNames(false);
    expect(names.key('x_1', 'column t.x_1')).toBe('x_1');
    expect(() => {
      names.assertMapped();
    }).not.toThrow();
  });

  it("gives the plugin's names, under its options", () => {
    expect(new KeyNames(true).key('first_name', 'column t.first_name')).toBe(
      'firstName',
    );
    expect(
      new KeyNames({ underscoreBeforeDigits: true }).key(
        'address_line_1',
        'column t.address_line_1',
      ),
    ).toBe('addressLine1');
    expect(
      new KeyNames({ upperCase: true }).key(
        'FIRST_NAME',
        'column t.FIRST_NAME',
      ),
    ).toBe('firstName');
  });

  it('reports every name the plugin would not turn back into itself, in one camel_case_mismatch', () => {
    const names = new KeyNames(true);
    names.key('address_line_1', 'column t.address_line_1');
    names.key('first_name', 'column t.first_name');
    names.key('amazon_q_ready', 'column t.amazon_q_ready');
    expect(
      mismatch(() => {
        names.assertMapped();
      }),
    ).toBe(
      'column t.address_line_1 becomes addressLine1 in camelCase, which CamelCasePlugin turns back into address_line1; column t.amazon_q_ready becomes amazonQReady in camelCase, which CamelCasePlugin turns back into amazon_qready',
    );
  });
});

describe('renderKyselyTypes with camelCase', () => {
  const catalog = catalogOf({
    tables: {
      contact_phones: table('contact_phones', {
        phone_number: column('text', { nullable: false }),
      }),
      'audit_log.change_sets': table('change_sets', {
        changed_at: column('bool', { nullable: false }),
      }),
    },
  });

  it('writes the keys the plugin reads, for schemas, tables, and columns, keeping type names', () => {
    const text = renderKyselyTypes(catalog, { camelCase: true });
    expect(text).toContain(
      'export interface ContactPhonesTable {\n  phoneNumber: string;\n}',
    );
    expect(text).toContain(
      'export interface AuditLogChangeSetsTable {\n  changedAt: boolean;\n}',
    );
    expect(text).toContain(
      "export interface DB {\n  'auditLog.changeSets': AuditLogChangeSetsTable;\n  contactPhones: ContactPhonesTable;\n}",
    );
  });

  it('names every column and table the plugin cannot map back', () => {
    const lines = catalogOf({
      tables: { lines: table('lines', { line_1: column('text') }) },
    });
    expect(mismatch(() => renderKyselyTypes(lines, { camelCase: true }))).toBe(
      'column lines.line_1 becomes line1 in camelCase, which CamelCasePlugin turns back into line1',
    );
    expect(
      renderKyselyTypes(lines, { camelCase: { underscoreBeforeDigits: true } }),
    ).toContain('  line1: string | null;');
    const versioned = catalogOf({
      tables: { v_1: table('v_1', { line_1: column('text') }) },
    });
    expect(
      mismatch(() => renderKyselyTypes(versioned, { camelCase: true })),
    ).toBe(
      'column v_1.line_1 becomes line1 in camelCase, which CamelCasePlugin turns back into line1; table v_1 becomes v1 in camelCase, which CamelCasePlugin turns back into v1',
    );
  });
});
