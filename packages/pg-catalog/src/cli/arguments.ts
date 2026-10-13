/**
 * The CLI's arguments (SPEC 11.2): parsed with `node:util`'s `parseArgs` in
 * strict mode, so an unknown option or a missing value fails instead of
 * being ignored, then checked against the one command they name.
 * @ref https://nodejs.org/api/util.html#utilparseargsconfig
 * @packageDocumentation
 */
import { parseArgs } from 'node:util';

/** What `--help` prints. */
export const USAGE: string = `Usage:
  pg-catalog extract [--check] [--config <file>]
  pg-catalog drift --env <name> [--json] [--config <file>]
  pg-catalog rules --check [--config <file>]
  pg-catalog surface [--check] [--config <file>]
  pg-catalog --help
  pg-catalog --version

Commands:
  extract  Replay the migrations and write the configured files. With
           --check, write nothing and exit 1 when a file is stale or missing.
  drift    Compare the database of a drift environment with the committed
           catalog, and exit 1 when they differ. --json prints the
           differences as JSON.
  rules    With --check, run every fixture of the declared resources
           through their schemas and through the replayed database, and
           exit 1 when they disagree.
  surface  Write the API surface of the declared resources to the
           configured file. With --check, write nothing, print each change
           from the file, and exit 1 on a breaking one or a missing file.

Options:
  --config <file>  The configuration file. Default: the first of
                   pg-catalog.config.ts, .mts, .js, and .mjs here.

Exit codes: 0 current, no drift, no disagreement, or no breaking change; 1
stale, drift, a disagreement, or a breaking change; 2 could not run.
`;

/** What the arguments ask for; `config` is the `--config` path as given. */
export type CliCommand =
  | { readonly name: 'help' }
  | { readonly name: 'version' }
  | {
      readonly name: 'extract';
      readonly check: boolean;
      readonly config: string | undefined;
    }
  | {
      readonly name: 'drift';
      readonly environment: string;
      readonly json: boolean;
      readonly config: string | undefined;
    }
  | { readonly name: 'rules'; readonly config: string | undefined }
  | {
      readonly name: 'surface';
      readonly check: boolean;
      readonly config: string | undefined;
    };

/** A mistake in the arguments, reported with a pointer to `--help`. */
export class UsageError extends Error {
  public override readonly name = 'UsageError';
}

const OPTIONS = {
  check: { type: 'boolean' },
  config: { type: 'string' },
  env: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

type Values = ReturnType<
  typeof parseArgs<{ options: typeof OPTIONS }>
>['values'];

function parse(args: ReadonlyArray<string>): {
  readonly values: Values;
  readonly positionals: ReadonlyArray<string>;
} {
  try {
    return parseArgs({
      args: [...args],
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    // parseArgs reports unknown options and missing values as ERR_PARSE_ARGS_* TypeErrors.
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function refuse(
  values: Values,
  names: ReadonlyArray<keyof Values>,
  command: string,
): void {
  const given = names.find((name) => values[name] !== undefined);
  if (given !== undefined) {
    throw new UsageError(`${command} does not take --${given}`);
  }
}

/** The command `args` (the arguments after the bin's name) ask for; a mistake throws `UsageError`. */
export function parseCommand(args: ReadonlyArray<string>): CliCommand {
  const { values, positionals } = parse(args);
  if (values.help === true) {
    return { name: 'help' };
  }
  if (values.version === true) {
    return { name: 'version' };
  }
  const [command, extra] = positionals;
  if (extra !== undefined) {
    throw new UsageError(`unexpected argument ${extra}`);
  }
  if (command === 'extract') {
    refuse(values, ['env', 'json'], 'extract');
    return {
      name: 'extract',
      check: values.check === true,
      config: values.config,
    };
  }
  if (command === 'drift') {
    refuse(values, ['check'], 'drift');
    if (values.env === undefined) {
      throw new UsageError('drift needs --env <name>');
    }
    return {
      name: 'drift',
      environment: values.env,
      json: values.json === true,
      config: values.config,
    };
  }
  if (command === 'rules') {
    refuse(values, ['env', 'json'], 'rules');
    if (values.check !== true) {
      throw new UsageError('rules needs --check');
    }
    return { name: 'rules', config: values.config };
  }
  if (command === 'surface') {
    refuse(values, ['env', 'json'], 'surface');
    return {
      name: 'surface',
      check: values.check === true,
      config: values.config,
    };
  }
  throw new UsageError(
    command === undefined ? 'missing command' : `unknown command ${command}`,
  );
}
