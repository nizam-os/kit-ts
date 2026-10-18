/**
 * `pnpm run release:pack --out-dir <directory>`: packs every public package
 * whose version npm does not have (`changeset pack`), checks the tarballs
 * (check.ts) and writes the release manifest beside them (root ADR 0013).
 * Prints each release and each notice; exits 1 when a check fails, 2 on a
 * usage error. Under GitHub Actions it also writes the number of releases
 * (`count`) and the manifest's SHA-256 (`digest`) to the step's outputs.
 * It runs where the kit is a workspace of its own: its public repository, or
 * the work tree of an export.
 * @packageDocumentation
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { checkRelease } from './check.ts';
import { digestOf, MANIFEST, manifestText } from './manifest.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const EXIT_PROBLEMS = 1;
const EXIT_USAGE = 2;

function commitOf(): string {
  const sha = process.env['GITHUB_SHA'];
  if (sha !== undefined && sha !== '') {
    return sha;
  }
  return spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout.trim();
}

const { values } = parseArgs({ options: { 'out-dir': { type: 'string' } } });
const target = values['out-dir'];
if (target === undefined || target === '') {
  process.stderr.write('usage: pnpm run release:pack --out-dir <directory>\n');
  process.exit(EXIT_USAGE);
}
const directory = resolve(target);
if (existsSync(directory) && readdirSync(directory).length > 0) {
  process.stderr.write(`release:pack: ${directory} is not empty\n`);
  process.exit(EXIT_USAGE);
}

const pack = spawnSync(
  'pnpm',
  ['exec', 'changeset', 'pack', '--out-dir', directory],
  {
    cwd: ROOT,
    stdio: 'inherit',
  },
);
if (pack.status !== 0) {
  process.stderr.write('release:pack: changeset pack failed\n');
  process.exit(EXIT_PROBLEMS);
}

const { problems, notices, manifest } = checkRelease({
  root: ROOT,
  directory,
  commit: commitOf(),
});
for (const notice of notices) {
  process.stdout.write(`${notice}\n`);
}
if (problems.length > 0) {
  for (const problem of problems) {
    process.stderr.write(`${problem}\n`);
  }
  process.stderr.write(
    `release:pack: ${problems.length} problem(s); nothing may be published\n`,
  );
  process.exit(EXIT_PROBLEMS);
}
const text = manifestText(manifest);
writeFileSync(join(directory, MANIFEST), text);
const digest = digestOf(text);
for (const release of manifest.releases) {
  process.stdout.write(
    `${release.gitTag} (${release.tag}) ${release.integrity}\n`,
  );
}
process.stdout.write(
  `${manifest.releases.length} release(s); ${MANIFEST} ${digest}\n`,
);
const output = process.env['GITHUB_OUTPUT'];
if (output !== undefined && output !== '') {
  appendFileSync(
    output,
    `count=${manifest.releases.length}\ndigest=${digest}\n`,
  );
}
