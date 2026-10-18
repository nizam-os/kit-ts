import type { RunGitleaks } from './secrets.ts';

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findingsOf, scanEnvironment, scanForSecrets } from './secrets.ts';

const hasGitleaks = spawnSync('gitleaks', ['version']).status === 0;

// A GitHub token, built at run time so no scanner of this repository finds
// it in the source.
const TOKEN = ['ghp', '_', 'q8Mv2RfT6wXz0bNc4LyK1hPs9JdGu3VeA7Qo'].join('');

let directory: string;

/** A gitleaks that reports one finding, as gitleaks exits when it finds one. */
const reportingOneFinding: RunGitleaks = (args) => {
  const report = args.find((arg) => arg.startsWith('--report-path='));
  writeFileSync(
    report?.slice('--report-path='.length) ?? '',
    JSON.stringify([{ RuleID: 'github-pat', File: 'x.js', StartLine: 1 }]),
  );
  return { status: 3, stderr: '' };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'kit-release-secrets-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('findingsOf', () => {
  it('reads the rule, file and line of each finding', () => {
    expect(
      findingsOf([
        {
          RuleID: 'github-pat',
          File: 'a/dist/index.js',
          StartLine: 3,
          Secret: 'REDACTED',
        },
      ]),
    ).toEqual([{ rule: 'github-pat', file: 'a/dist/index.js', line: 3 }]);
  });

  it.each([[{}], [[{ RuleID: 'x', File: 'y' }]], [[null]]])(
    'refuses a report of another shape: %j',
    (report) => {
      expect(() => findingsOf(report)).toThrow(TypeError);
    },
  );
});

describe('scanEnvironment', () => {
  it('leaves out every variable that would choose the configuration', () => {
    expect(
      scanEnvironment({
        PATH: '/bin',
        GITLEAKS_CONFIG: 'x',
        GITLEAKS_CONFIG_TOML: 'y',
      }),
    ).toEqual({ PATH: '/bin' });
  });
});

describe('scanForSecrets', () => {
  it('runs the default rules from a file of its own, with nothing to ignore', () => {
    let seen: ReadonlyArray<string> = [];
    let configuration = '';
    const run: RunGitleaks = (args, options) => {
      seen = args;
      expect(options.cwd).toBe(directory);
      const config = args.find((arg) => arg.startsWith('--config='));
      configuration = readFileSync(
        config?.slice('--config='.length) ?? '',
        'utf8',
      );
      return { status: 0, stderr: '' };
    };
    expect(scanForSecrets(directory, run)).toEqual([]);
    expect(configuration).toBe('[extend]\nuseDefault = true\n');
    expect(seen).toEqual(
      expect.arrayContaining([
        'dir',
        '.',
        '--ignore-gitleaks-allow',
        '--redact',
        '--exit-code=3',
        '--report-format=json',
      ]),
    );
  });

  it('reads the report when gitleaks finds something', () => {
    expect(scanForSecrets(directory, reportingOneFinding)).toEqual([
      { rule: 'github-pat', file: 'x.js', line: 1 },
    ]);
  });

  it('fails when gitleaks fails or cannot start', () => {
    expect(() =>
      scanForSecrets(directory, () => ({ status: 1, stderr: 'bad flag\n' })),
    ).toThrow('gitleaks failed: bad flag');
    expect(() =>
      scanForSecrets(directory, () => ({
        status: null,
        stderr: '',
        error: new Error('spawnSync gitleaks ENOENT'),
      })),
    ).toThrow(
      'gitleaks could not run (spawnSync gitleaks ENOENT); the release check needs it on the PATH',
    );
  });

  it.runIf(hasGitleaks)(
    'finds a token with the real gitleaks, even marked gitleaks:allow',
    () => {
      writeFileSync(
        join(directory, 'index.js'),
        `export const t = '${TOKEN}'; // gitleaks:allow\n`,
      );
      expect(
        scanForSecrets(directory).map(({ rule, file }) => [rule, file]),
      ).toEqual([['github-pat', 'index.js']]);
    },
  );

  it.runIf(hasGitleaks)(
    'finds nothing in a clean directory with the real gitleaks',
    () => {
      writeFileSync(join(directory, 'index.js'), 'export const one = 1;\n');
      expect(scanForSecrets(directory)).toEqual([]);
    },
  );
});
