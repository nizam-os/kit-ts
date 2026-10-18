/**
 * `node scripts/release/github-release.ts <release directory> <manifest digest> [<minutes>]`:
 * the GitHub release job (root ADR 0013). Checks the manifest against the
 * digest the pack job passed on, waits up to `<minutes>` (60 by default)
 * until npm holds every version, then creates each package's release
 * (releaser.ts). `GH_TOKEN` and `GITHUB_REPOSITORY` come from the workflow.
 * Imports Node's builtins only: the job installs nothing. Exits 1 on any
 * failure or when a version is still waiting for approval on npm, 2 on a
 * usage error.
 * @packageDocumentation
 */
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';

import { ghApi } from './github.ts';
import { readManifest } from './manifest.ts';
import { registryReader } from './registry.ts';
import { createReleases, waitUntilLive } from './releaser.ts';

const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const MINUTE = 60_000;
const INTERVAL = 30_000;

const [directory, digest, minutes = '60'] = process.argv.slice(2);
const repository = process.env['GITHUB_REPOSITORY'];
if (
  directory === undefined ||
  digest === undefined ||
  !/^\d+$/u.test(minutes) ||
  repository === undefined
) {
  process.stderr.write(
    'usage: GITHUB_REPOSITORY=<owner/name> github-release.ts <release directory> <manifest digest> [<minutes>]\n',
  );
  process.exit(EXIT_USAGE);
}
const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
try {
  const manifest = readManifest(resolve(directory), digest);
  const waiting = await waitUntilLive(
    manifest.releases,
    {
      registry: registryReader(),
      sleep: async (ms) => setTimeout(ms),
      now: Date.now,
      log,
    },
    Number(minutes) * MINUTE,
    INTERVAL,
  );
  if (waiting.length > 0) {
    throw new Error(
      `npm does not hold ${waiting.map(({ gitTag }) => gitTag).join(', ')} yet: ` +
        'approve the staged versions on npm, then rerun this job',
    );
  }
  createReleases(manifest, { github: ghApi(), repository, log });
} catch (error) {
  process.stderr.write(
    `github-release: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = EXIT_FAILED;
}
