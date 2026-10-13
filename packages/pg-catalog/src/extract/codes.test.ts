import { describe, expect, it } from 'vitest';

import {
  GENERATED_KINDS,
  POLICY_COMMANDS,
  REFERENTIAL_ACTIONS,
  TYPE_KINDS,
  decode,
  decodeOptional,
} from './codes';

describe('pg_catalog codes', () => {
  it('decodes every code the catalog documents', () => {
    expect(Object.entries(TYPE_KINDS)).toHaveLength(6);
    expect(decode(REFERENTIAL_ACTIONS, 'd', 'confdeltype')).toBe('setDefault');
    expect(decode(POLICY_COMMANDS, '*', 'polcmd')).toBe('all');
    expect(decodeOptional(GENERATED_KINDS, 'v', 'attgenerated')).toBe(
      'virtual',
    );
  });

  it('reads "" as no code', () => {
    expect(decodeOptional(GENERATED_KINDS, '', 'attgenerated')).toBeNull();
  });

  it('fails with unsupported_server for a code a newer PostgreSQL may add, never guessing', () => {
    expect(() => decode(TYPE_KINDS, 'x', 'typtype')).toThrow(
      expect.objectContaining({
        code: 'unsupported_server',
        message:
          'the server returned typtype "x", which this version of @nizam-os/pg-catalog does not know',
      }),
    );
    expect(() => decode(TYPE_KINDS, 'constructor', 'typtype')).toThrow(
      expect.objectContaining({ code: 'unsupported_server' }),
    );
  });
});
