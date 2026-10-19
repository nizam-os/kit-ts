/**
 * Publishes a checked release to npm (root ADR 0013), one package at a time
 * in the manifest's order, so a package's dependencies are on npm before it.
 * It reads every package's state from the registry first and runs npm only
 * when each release can go through, so a release that would stop halfway for
 * a reason known in advance stops before it starts.
 *
 * - A version npm already holds with the tarball's integrity is skipped, so a
 *   rerun after a partial failure picks up where it stopped. One it holds
 *   with other content stops the release.
 * - A package npm has is staged (`npm stage publish`) with trusted publishing:
 *   npm exchanges the job's OIDC token for one that can only stage, and the
 *   version goes live when a maintainer approves it on npm with two-factor
 *   authentication. No token is offered, so nothing else can authenticate.
 *   Before anything is published, npm is asked whether each such package's
 *   trusted publisher accepts this workflow (trust.ts): one that is missing,
 *   or expired unused, stops the release before it starts.
 * - A package npm does not have yet cannot be staged by trusted publishing,
 *   which is configured on an existing package. Its first version is
 *   published with the bootstrap token, when the `npm` environment holds
 *   one, and goes live at once.
 *
 * npm runs from the release directory with a user configuration of this
 * module's, and none of the job's `npm_config_*` variables, so no `.npmrc` of
 * the repository or the runner can change the registry or the credentials. It
 * publishes the tarball as built (no lifecycle scripts), named by its path
 * ({@link tarballSpec}), with provenance.
 * Node's builtins only: the publish job installs nothing.
 * @ref https://docs.npmjs.com/trusted-publishers
 * @ref https://docs.npmjs.com/staged-publishing
 * @ref https://docs.npmjs.com/cli/v11/commands/npm-publish
 * @packageDocumentation
 */
import type { Release, ReleaseManifest } from './manifest.ts';
import type { ReadRegistry, RegistryState } from './registry.ts';
import type { CheckTrust } from './trust.ts';

import { REGISTRY } from './registry.ts';

/** What happened to one release. */
export interface Outcome {
  readonly release: Release;
  readonly result: 'published' | 'staged' | 'already on npm';
  /** The id npm gave a staged version, when it printed one. */
  readonly stageId?: string;
}

/** How a publish runs npm: `withToken` offers the bootstrap token. */
export type RunNpm = (
  args: ReadonlyArray<string>,
  withToken: boolean,
) => { readonly status: number | null; readonly stdout: string };

/** What publishing needs from outside. */
export interface PublishDeps {
  readonly registry: ReadRegistry;
  readonly npm: RunNpm;
  /** Whether a package's trusted publisher accepts this workflow. */
  readonly trust: CheckTrust;
  /** Whether the `npm` environment holds the bootstrap token. */
  readonly hasToken: boolean;
  readonly log: (line: string) => void;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `stageId` and `integrity` npm printed for a package with `--json`, if it printed them. */
export function npmReport(
  stdout: string,
  name: string,
): { readonly stageId?: string; readonly integrity?: string } {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return {};
  }
  const report: unknown = isObject(json) ? Reflect.get(json, name) : undefined;
  if (!isObject(report)) {
    return {};
  }
  const stageId: unknown = Reflect.get(report, 'stageId');
  const integrity: unknown = Reflect.get(report, 'integrity');
  return {
    ...(typeof stageId === 'string' ? { stageId } : {}),
    ...(typeof integrity === 'string' ? { integrity } : {}),
  };
}

/**
 * The argument that names a release's tarball to npm, which runs from the
 * release directory: the tarball's path there, starting with `./` as npm's
 * documentation advises for a local path. Without it, npm reads the
 * manifest's `packages/<name>-<version>.tgz` as a GitHub repository,
 * `<user>/<repo>`, and tries to clone it.
 * @ref https://docs.npmjs.com/cli/v11/using-npm/package-spec#tarballs
 * @ref https://github.com/npm/cli/blob/v11.19.0/node_modules/npm-package-arg/lib/npa.js (`resolve`: a file spec, then a GitHub shorthand)
 */
export function tarballSpec(release: Release): string {
  return `./${release.file}`;
}

/** The arguments of the npm command that publishes or stages a release. */
export function npmArgs(release: Release, stage: boolean): Array<string> {
  return [
    ...(stage ? ['stage', 'publish'] : ['publish']),
    tarballSpec(release),
    `--registry=${REGISTRY}/`,
    '--access=public',
    `--tag=${release.tag}`,
    '--provenance',
    '--ignore-scripts',
    '--json',
  ];
}

/** Why a release cannot go through npm's current state, or `undefined` when it can. */
function blocker(
  release: Release,
  state: RegistryState,
  hasToken: boolean,
): string | undefined {
  const { name, version } = release;
  if (
    state.exists &&
    state.versions.has(version) &&
    state.versions.get(version) !== release.integrity
  ) {
    return `npm holds ${name}@${version} with other content than this release built`;
  }
  if (!state.exists && !hasToken) {
    return (
      `${name} is not on npm yet, and trusted publishing cannot stage a package's first version: ` +
      'store the bootstrap token in the npm environment and rerun (CONTRIBUTING, "Releases")'
    );
  }
  return undefined;
}

/** Why trusted publishing cannot stage a release, or `undefined` when it can or need not. */
async function trustBlocker(
  release: Release,
  state: RegistryState,
  trust: CheckTrust,
): Promise<string | undefined> {
  if (!state.exists || state.versions.has(release.version)) {
    return undefined;
  }
  const answer = await trust(release.name);
  return answer.accepted
    ? undefined
    : `${release.name} cannot be staged: ${answer.reason}`;
}

function publishOne(
  release: Release,
  state: RegistryState,
  deps: PublishDeps,
): Outcome {
  const { name, version } = release;
  if (state.exists && state.versions.has(version)) {
    return { release, result: 'already on npm' };
  }
  const stage = state.exists;
  const result = deps.npm(npmArgs(release, stage), !stage);
  const verb = stage ? 'npm stage publish' : 'npm publish';
  if (result.status !== 0) {
    throw new Error(
      `${verb} of ${name}@${version} failed with exit code ${String(result.status)}`,
    );
  }
  const report = npmReport(result.stdout, name);
  if (
    report.integrity !== undefined &&
    report.integrity !== release.integrity
  ) {
    throw new Error(
      `${verb} sent ${name}@${version} with another integrity than the tarball checked`,
    );
  }
  return {
    release,
    result: stage ? 'staged' : 'published',
    ...(report.stageId === undefined ? {} : { stageId: report.stageId }),
  };
}

/**
 * Publishes or stages every release of a checked manifest, in order, stopping
 * at the first failure, and returns what happened to each. Nothing is
 * published when the registry shows that a release cannot go through.
 */
export async function publishAll(
  manifest: ReleaseManifest,
  deps: PublishDeps,
): Promise<Array<Outcome>> {
  const checked: Array<{
    readonly release: Release;
    readonly state: RegistryState;
  }> = [];
  const blockers: Array<string> = [];
  for (const release of manifest.releases) {
    const state = await deps.registry(release.name);
    const problem =
      blocker(release, state, deps.hasToken) ??
      (await trustBlocker(release, state, deps.trust));
    if (problem !== undefined) {
      blockers.push(problem);
    }
    checked.push({ release, state });
  }
  if (blockers.length > 0) {
    throw new Error(`nothing was published: ${blockers.join('; ')}`);
  }
  const outcomes: Array<Outcome> = [];
  for (const { release, state } of checked) {
    const outcome = publishOne(release, state, deps);
    const id =
      outcome.stageId === undefined ? '' : ` (stage ${outcome.stageId})`;
    deps.log(`${release.gitTag}: ${outcome.result}${id}`);
    outcomes.push(outcome);
  }
  return outcomes;
}

/** The job summary: what was published, and what waits for a maintainer's approval on npm. */
export function publishSummary(outcomes: ReadonlyArray<Outcome>): string {
  const lines = ['## npm', ''];
  for (const { release, result, stageId } of outcomes) {
    const id = stageId === undefined ? '' : `, stage \`${stageId}\``;
    lines.push(`- \`${release.gitTag}\` (${release.tag}): ${result}${id}`);
  }
  if (outcomes.some(({ result }) => result === 'staged')) {
    lines.push(
      '',
      'A staged version goes live when a maintainer approves it with two-factor authentication: ' +
        'the Staged Packages tab of the package on npmjs.com, or `npm stage approve <stage id>`. ' +
        'The GitHub releases follow once every version is live.',
    );
  }
  return `${lines.join('\n')}\n`;
}
