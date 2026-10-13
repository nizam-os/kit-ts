import { describe, expect, it } from 'vitest';

import { parseCommand, USAGE, UsageError } from './arguments';

describe('parseCommand (SPEC 11.2)', () => {
  it('reads --help and --version, short or long, wherever they appear', () => {
    expect(parseCommand(['--help'])).toEqual({ name: 'help' });
    expect(parseCommand(['-h'])).toEqual({ name: 'help' });
    expect(parseCommand(['extract', '--help'])).toEqual({ name: 'help' });
    expect(parseCommand(['--help', '--version'])).toEqual({ name: 'help' });
    expect(parseCommand(['--version'])).toEqual({ name: 'version' });
    expect(parseCommand(['drift', '-v'])).toEqual({ name: 'version' });
  });

  it('reads extract with its options, in any order and in --name=value form', () => {
    expect(parseCommand(['extract'])).toEqual({
      name: 'extract',
      check: false,
      config: undefined,
    });
    expect(
      parseCommand(['--config', 'db/pg-catalog.config.ts', 'extract', '--check']),
    ).toEqual({ name: 'extract', check: true, config: 'db/pg-catalog.config.ts' });
    expect(parseCommand(['extract', '--config=pg-catalog.config.mjs'])).toEqual({
      name: 'extract',
      check: false,
      config: 'pg-catalog.config.mjs',
    });
  });

  it('reads drift with its environment and options', () => {
    expect(parseCommand(['drift', '--env', 'production'])).toEqual({
      name: 'drift',
      environment: 'production',
      json: false,
      config: undefined,
    });
    expect(
      parseCommand(['drift', '--env=staging-2', '--json', '--config', 'c.mjs']),
    ).toEqual({
      name: 'drift',
      environment: 'staging-2',
      json: true,
      config: 'c.mjs',
    });
  });

  it('reads rules --check with its configuration', () => {
    expect(parseCommand(['rules', '--check'])).toEqual({
      name: 'rules',
      config: undefined,
    });
    expect(parseCommand(['--config=c.mjs', 'rules', '--check'])).toEqual({
      name: 'rules',
      config: 'c.mjs',
    });
  });

  it('reads surface, writing or with --check, with its configuration', () => {
    expect(parseCommand(['surface'])).toEqual({
      name: 'surface',
      check: false,
      config: undefined,
    });
    expect(parseCommand(['surface', '--check', '--config', 'c.mjs'])).toEqual({
      name: 'surface',
      check: true,
      config: 'c.mjs',
    });
  });

  const mistakes: ReadonlyArray<readonly [ReadonlyArray<string>, string]> = [
    [[], 'missing command'],
    [['generate'], 'unknown command generate'],
    [['extract', 'now'], 'unexpected argument now'],
    [['extract', '--', '--check'], 'unexpected argument --check'],
    [['extract', '--env', 'production'], 'extract does not take --env'],
    [['extract', '--json'], 'extract does not take --json'],
    [['drift'], 'drift needs --env <name>'],
    [['drift', '--json'], 'drift needs --env <name>'],
    [
      ['drift', '--env', 'production', '--check'],
      'drift does not take --check',
    ],
    [['rules'], 'rules needs --check'],
    [['rules', '--check', '--json'], 'rules does not take --json'],
    [['rules', '--check', '--env', 'production'], 'rules does not take --env'],
    [['surface', 'now'], 'unexpected argument now'],
    [['surface', '--json'], 'surface does not take --json'],
    [
      ['surface', '--check', '--env', 'production'],
      'surface does not take --env',
    ],
  ];

  it.each(mistakes)('rejects %j: %s', (args, message) => {
    expect(() => parseCommand(args)).toThrow(new UsageError(message));
  });

  it('passes on the parser’s own message for an unknown option, a missing value, or a value given to a flag', () => {
    expect(() => parseCommand(['extract', '--force'])).toThrow(
      /^Unknown option '--force'/u,
    );
    expect(() => parseCommand(['extract', '-x'])).toThrow(
      /^Unknown option '-x'/u,
    );
    expect(() => parseCommand(['drift', '--env'])).toThrow(
      /^Option '--env <value>' argument missing/u,
    );
    expect(() => parseCommand(['extract', '--check=yes'])).toThrow(
      /^Option '--check' does not take an argument/u,
    );
    expect(() => parseCommand(['extract', '--force'])).toThrow(UsageError);
  });
});

describe('USAGE', () => {
  it('lists the six forms of SPEC 11.2 and the exit codes', () => {
    expect(USAGE.split('\n').slice(0, 7)).toEqual([
      'Usage:',
      '  pg-catalog extract [--check] [--config <file>]',
      '  pg-catalog drift --env <name> [--json] [--config <file>]',
      '  pg-catalog rules --check [--config <file>]',
      '  pg-catalog surface [--check] [--config <file>]',
      '  pg-catalog --help',
      '  pg-catalog --version',
    ]);
    expect(USAGE).toContain(
      'Exit codes: 0 current, no drift, no disagreement, or no breaking change; 1\nstale, drift, a disagreement, or a breaking change; 2 could not run.',
    );
  });
});
