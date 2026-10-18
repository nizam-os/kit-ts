/**
 * The secrets gitleaks finds in what a release would publish (root ADR 0013).
 * The scan runs gitleaks' default rules, named by a configuration file of its
 * own, so no `.gitleaks.toml`, `GITLEAKS_CONFIG` or `.gitleaksignore` found
 * along the way can narrow it, and it ignores `gitleaks:allow` comments. The
 * report is redacted: a finding names the rule, the file and the line, never
 * the value.
 * @ref https://github.com/gitleaks/gitleaks#usage
 * @ref https://github.com/gitleaks/gitleaks#configuration
 * @packageDocumentation
 */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

/** A secret gitleaks found: its rule, and where. */
export interface Finding {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
}

/** How the scan runs gitleaks; `error` is set when it could not start. */
export type RunGitleaks = (
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
) => {
  readonly status: number | null;
  readonly stderr: string;
  readonly error?: Error;
};

// gitleaks exits 1 on a finding by default, as it does on some failures;
// another code tells them apart.
const EXIT_FOUND = 3;
const CONFIGURATION = '[extend]\nuseDefault = true\n';

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The findings of a gitleaks JSON report. */
export function findingsOf(report: unknown): Array<Finding> {
  if (!Array.isArray(report)) {
    throw new TypeError('the gitleaks report is not a list');
  }
  return report.map((entry: unknown) => {
    const rule: unknown = isObject(entry)
      ? Reflect.get(entry, 'RuleID')
      : undefined;
    const file: unknown = isObject(entry)
      ? Reflect.get(entry, 'File')
      : undefined;
    const line: unknown = isObject(entry)
      ? Reflect.get(entry, 'StartLine')
      : undefined;
    if (
      typeof rule !== 'string' ||
      typeof file !== 'string' ||
      typeof line !== 'number'
    ) {
      throw new TypeError(
        'the gitleaks report holds a finding without a rule, file or line',
      );
    }
    return { rule, file, line };
  });
}

/** The environment gitleaks runs in: this process's, without what would choose its configuration. */
export function scanEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith('GITLEAKS_')),
  );
}

const runGitleaks: RunGitleaks = (args, options) =>
  spawnSync('gitleaks', args, { ...options, encoding: 'utf8' });

/**
 * Scans a directory for secrets with gitleaks and returns the findings, which
 * name files relative to the directory; none when gitleaks found nothing.
 */
export function scanForSecrets(
  directory: string,
  run: RunGitleaks = runGitleaks,
): Array<Finding> {
  const scratch = mkdtempSync(join(tmpdir(), 'kit-release-gitleaks-'));
  try {
    const config = join(scratch, 'gitleaks.toml');
    writeFileSync(config, CONFIGURATION);
    const ignore = join(scratch, 'ignore');
    mkdirSync(ignore);
    const report = join(scratch, 'report.json');
    const result = run(
      [
        'dir',
        '.',
        `--config=${config}`,
        `--gitleaks-ignore-path=${ignore}`,
        '--ignore-gitleaks-allow',
        '--no-banner',
        '--redact',
        '--log-level=warn',
        `--exit-code=${EXIT_FOUND}`,
        '--report-format=json',
        `--report-path=${report}`,
      ],
      { cwd: directory, env: scanEnvironment(process.env) },
    );
    if (result.error !== undefined) {
      throw new Error(
        `gitleaks could not run (${result.error.message}); the release check needs it on the PATH`,
      );
    }
    if (result.status === 0) {
      return [];
    }
    if (result.status !== EXIT_FOUND) {
      throw new Error(`gitleaks failed: ${result.stderr.trim()}`);
    }
    return findingsOf(JSON.parse(readFileSync(report, 'utf8')));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
