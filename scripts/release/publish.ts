/**
 * `node scripts/release/publish.ts <release directory> <manifest digest>`:
 * the publish job (root ADR 0013). Checks the manifest and the tarballs
 * against the digest the pack job passed on, asks npm whether each package to
 * be staged has a trusted publisher for this workflow (trust.ts), then
 * publishes or stages every release in order (publisher.ts) and writes the
 * job summary. The bootstrap token, when the `npm` environment holds one,
 * arrives as `NODE_AUTH_TOKEN`; GitHub's OIDC token request, as the
 * `ACTIONS_ID_TOKEN_REQUEST_*` variables of a job that may write an id-token.
 * Imports Node's builtins only: the job installs nothing. Exits 1 on any
 * failure, 2 on a usage error.
 * @packageDocumentation
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { readManifest } from './manifest.ts';
import { npmRunner, npmVersionProblem } from './npm.ts';
import { publishAll, publishSummary } from './publisher.ts';
import { registryReader } from './registry.ts';
import { trustChecker } from './trust.ts';

const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

const [directory, digest] = process.argv.slice(2);
if (directory === undefined || digest === undefined) {
  process.stderr.write(
    'usage: publish.ts <release directory> <manifest digest>\n',
  );
  process.exit(EXIT_USAGE);
}
const scratch = mkdtempSync(join(tmpdir(), 'kit-release-npm-'));
try {
  const version = spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout;
  const problem = npmVersionProblem(version);
  if (problem !== undefined) {
    throw new Error(problem);
  }
  const release = resolve(directory);
  const manifest = readManifest(release, digest);
  const outcomes = await publishAll(manifest, {
    registry: registryReader(),
    npm: npmRunner(release, scratch),
    trust: trustChecker(process.env),
    hasToken: (process.env['NODE_AUTH_TOKEN'] ?? '') !== '',
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
  });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined && summary !== '') {
    appendFileSync(summary, publishSummary(outcomes));
  }
} catch (error) {
  process.stderr.write(
    `publish: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = EXIT_FAILED;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
