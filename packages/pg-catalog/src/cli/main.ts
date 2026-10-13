/**
 * `runCli` (SPEC 11.2): runs the command the arguments name, writes results
 * to standard output and errors to standard error as
 * `pg-catalog: <message>`, and returns the exit code: 0 when the files are
 * current, nothing drifted, the declarations and the database agree, or
 * the surface has no breaking change; 1 when a file is stale, the database
 * drifted, they disagree, or the surface broke; 2 when the command could
 * not run.
 * @packageDocumentation
 */
import type { ExtractionConfig } from '../config';
import type { CliCommand } from './arguments';

import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

import { drift } from '../commands/drift';
import { extract } from '../commands/extract';
import { formatDiff } from '../commands/format-diff';
import { formatRules } from '../commands/format-rules';
import { formatSurface } from '../commands/format-surface';
import { checkRules } from '../commands/rules';
import { checkSurface, writeSurface } from '../commands/surface';
import { findConfigFile, loadConfigFile } from '../config-file';
import { isPgCatalogError, PgCatalogError } from '../errors';
import { parseCommand, USAGE, UsageError } from './arguments';

/** Where the CLI reads and writes; the bin passes the process's own. */
export interface CliIo {
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const EXIT_OK = 0;
const EXIT_DIFFERENT = 1;
const EXIT_FAILED = 2;
/** The longest status, `unchanged`, so the paths line up. */
const STATUS_WIDTH = 9;
const JSON_INDENT = 2;

/** The installed package's version, read through the package's own `exports` map. */
function version(): string {
  const manifest: unknown = createRequire(import.meta.url)(
    '@nizam-os/pg-catalog/package.json',
  );
  const value: unknown =
    typeof manifest === 'object' && manifest !== null
      ? Reflect.get(manifest, 'version')
      : undefined;
  return typeof value === 'string' ? value : 'unknown';
}

/** The configuration and the directory its relative paths resolve against (SPEC 11.1). */
async function loadConfig(
  option: string | undefined,
  cwd: string,
): Promise<{ readonly config: ExtractionConfig; readonly directory: string }> {
  const path =
    option === undefined ? await findConfigFile(cwd) : resolve(cwd, option);
  if (path === null) {
    throw new PgCatalogError(
      'config_invalid',
      `no configuration file in ${cwd}: create pg-catalog.config.ts (or .mts, .js, .mjs), or pass --config <file>`,
    );
  }
  return { config: await loadConfigFile(path), directory: dirname(path) };
}

async function runExtract(
  command: Extract<CliCommand, { name: 'extract' }>,
  io: CliIo,
): Promise<number> {
  const { config, directory } = await loadConfig(command.config, io.cwd);
  const report = await extract(config, {
    cwd: directory,
    check: command.check,
  });
  for (const file of report.files) {
    io.stdout(
      `${file.status.padEnd(STATUS_WIDTH)} ${relative(io.cwd, file.path)}\n`,
    );
  }
  const outdated = report.files.some(
    (file) => file.status === 'stale' || file.status === 'missing',
  );
  return outdated ? EXIT_DIFFERENT : EXIT_OK;
}

async function runDrift(
  command: Extract<CliCommand, { name: 'drift' }>,
  io: CliIo,
): Promise<number> {
  const { config, directory } = await loadConfig(command.config, io.cwd);
  const { diff } = await drift(config, command.environment, {
    cwd: directory,
  });
  io.stdout(
    command.json
      ? `${JSON.stringify(diff, null, JSON_INDENT)}\n`
      : `${formatDiff(diff)}\n`,
  );
  return diff.changes.length === 0 ? EXIT_OK : EXIT_DIFFERENT;
}

async function runRules(
  command: Extract<CliCommand, { name: 'rules' }>,
  io: CliIo,
): Promise<number> {
  const { config, directory } = await loadConfig(command.config, io.cwd);
  const report = await checkRules(config, { cwd: directory });
  io.stdout(`${formatRules(report)}\n`);
  const failed = report.cases.some(
    (each) => each.problem !== null || each.disagreements.length > 0,
  );
  return failed ? EXIT_DIFFERENT : EXIT_OK;
}

async function runSurface(
  command: Extract<CliCommand, { name: 'surface' }>,
  io: CliIo,
): Promise<number> {
  const { config, directory } = await loadConfig(command.config, io.cwd);
  if (!command.check) {
    const report = await writeSurface(config, { cwd: directory });
    io.stdout(
      `${report.status.padEnd(STATUS_WIDTH)} ${relative(io.cwd, report.file)}\n`,
    );
    return EXIT_OK;
  }
  const report = await checkSurface(config, { cwd: directory });
  io.stdout(`${formatSurface(report, relative(io.cwd, report.file))}\n`);
  const broken =
    report.status === 'missing' ||
    report.changes.some((change) => change.breaking);
  return broken ? EXIT_DIFFERENT : EXIT_OK;
}

async function run(args: ReadonlyArray<string>, io: CliIo): Promise<number> {
  const command = parseCommand(args);
  if (command.name === 'help') {
    io.stdout(USAGE);
    return EXIT_OK;
  }
  if (command.name === 'version') {
    io.stdout(`${version()}\n`);
    return EXIT_OK;
  }
  if (command.name === 'rules') {
    return runRules(command, io);
  }
  if (command.name === 'surface') {
    return runSurface(command, io);
  }
  return command.name === 'extract'
    ? runExtract(command, io)
    : runDrift(command, io);
}

/** Runs the CLI with `args` (the arguments after the bin's name) and returns the exit code. */
export async function runCli(
  args: ReadonlyArray<string>,
  io: CliIo,
): Promise<number> {
  try {
    return await run(args, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(
        `pg-catalog: ${error.message}\nRun pg-catalog --help for usage.\n`,
      );
    } else if (isPgCatalogError(error)) {
      io.stderr(`pg-catalog: ${error.message}\n`);
    } else {
      // Not one of the documented failures: an error thrown by a function of
      // the configuration, a file system error, or a bug. The stack says which.
      const detail =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      io.stderr(`pg-catalog: ${detail}\n`);
    }
    return EXIT_FAILED;
  }
}
