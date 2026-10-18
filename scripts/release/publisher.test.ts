import type { Release, ReleaseManifest } from './manifest.ts';
import type { PublishDeps, RunNpm } from './publisher.ts';
import type { RegistryState } from './registry.ts';

import { describe, expect, it } from 'vitest';

import { npmArgs, npmReport, publishAll, publishSummary } from './publisher.ts';

const INTEGRITY = `sha512-${'A'.repeat(86)}==`;
const OTHER = `sha512-${'B'.repeat(86)}==`;

function releaseOf(name: string, version = '0.1.0'): Release {
  const short = name.slice('@nizam-os/'.length);
  return {
    name,
    version,
    tag: 'latest',
    file: `packages/nizam-os-${short}-${version}.tgz`,
    integrity: INTEGRITY,
    gitTag: `${name}@${version}`,
    prerelease: false,
    notes: '- x',
  };
}

const CORE = releaseOf('@nizam-os/ban-core');
const BINDING = releaseOf('@nizam-os/hono-ban', '1.4.0');
const MANIFEST: ReleaseManifest = {
  version: 1,
  commit: 'c'.repeat(40),
  releases: [CORE, BINDING],
};

interface Call {
  readonly args: ReadonlyArray<string>;
  readonly withToken: boolean;
}

function depsWith(
  states: Readonly<Record<string, RegistryState>>,
  options: { readonly hasToken?: boolean; readonly npm?: RunNpm } = {},
): PublishDeps & {
  readonly calls: Array<Call>;
  readonly lines: Array<string>;
} {
  const calls: Array<Call> = [];
  const lines: Array<string> = [];
  return {
    calls,
    lines,
    registry: async (name) => {
      await Promise.resolve();
      return states[name] ?? { exists: false };
    },
    npm:
      options.npm ??
      ((args, withToken) => {
        calls.push({ args, withToken });
        const name = args[0] === 'stage' ? args[2] : args[1];
        const release = [CORE, BINDING].find(
          (candidate) => candidate.file === name,
        );
        const stage =
          args[0] === 'stage'
            ? { stageId: `stage-${release?.name ?? ''}` }
            : {};
        return {
          status: 0,
          stdout: JSON.stringify({
            [release?.name ?? '']: { integrity: INTEGRITY, ...stage },
          }),
        };
      }),
    hasToken: options.hasToken ?? false,
    log: (line) => {
      lines.push(line);
    },
  };
}

const PRESENT: RegistryState = {
  exists: true,
  versions: new Map([['0.0.1', 'sha512-old']]),
};

describe('npmArgs', () => {
  it('publishes the tarball as built, with provenance, to the public registry', () => {
    expect(npmArgs(CORE, false)).toEqual([
      'publish',
      'packages/nizam-os-ban-core-0.1.0.tgz',
      '--registry=https://registry.npmjs.org/',
      '--access=public',
      '--tag=latest',
      '--provenance',
      '--ignore-scripts',
      '--json',
    ]);
    expect(npmArgs({ ...CORE, tag: 'next' }, true).slice(0, 3)).toEqual([
      'stage',
      'publish',
      'packages/nizam-os-ban-core-0.1.0.tgz',
    ]);
    expect(npmArgs({ ...CORE, tag: 'next' }, true)).toContain('--tag=next');
  });
});

describe('npmReport', () => {
  it('reads the stage id and integrity npm printed for the package', () => {
    expect(
      npmReport(
        '{"@nizam-os/a":{"stageId":"s1","integrity":"sha512-x"}}',
        '@nizam-os/a',
      ),
    ).toEqual({
      stageId: 's1',
      integrity: 'sha512-x',
    });
  });

  it('reads nothing from output it does not recognize', () => {
    expect(npmReport('npm notice', '@nizam-os/a')).toEqual({});
    expect(npmReport('{"@nizam-os/b":{}}', '@nizam-os/a')).toEqual({});
    expect(npmReport('{"@nizam-os/a":{"stageId":1}}', '@nizam-os/a')).toEqual(
      {},
    );
  });
});

describe('publishAll', () => {
  it('stages each package npm has, in order, offering no token', async () => {
    const deps = depsWith(
      { '@nizam-os/ban-core': PRESENT, '@nizam-os/hono-ban': PRESENT },
      { hasToken: true },
    );
    const outcomes = await publishAll(MANIFEST, deps);
    expect(
      outcomes.map(({ release, result, stageId }) => [
        release.name,
        result,
        stageId,
      ]),
    ).toEqual([
      ['@nizam-os/ban-core', 'staged', 'stage-@nizam-os/ban-core'],
      ['@nizam-os/hono-ban', 'staged', 'stage-@nizam-os/hono-ban'],
    ]);
    expect(
      deps.calls.map(({ args, withToken }) => [args[0], args[2], withToken]),
    ).toEqual([
      ['stage', 'packages/nizam-os-ban-core-0.1.0.tgz', false],
      ['stage', 'packages/nizam-os-hono-ban-1.4.0.tgz', false],
    ]);
    expect(deps.lines).toEqual([
      '@nizam-os/ban-core@0.1.0: staged (stage stage-@nizam-os/ban-core)',
      '@nizam-os/hono-ban@1.4.0: staged (stage stage-@nizam-os/hono-ban)',
    ]);
  });

  it('publishes the first version of a package npm does not have with the bootstrap token', async () => {
    const deps = depsWith(
      { '@nizam-os/hono-ban': PRESENT },
      { hasToken: true },
    );
    const outcomes = await publishAll(MANIFEST, deps);
    expect(outcomes.map(({ result }) => result)).toEqual([
      'published',
      'staged',
    ]);
    expect(
      deps.calls.map(({ args, withToken }) => [args[0], withToken]),
    ).toEqual([
      ['publish', true],
      ['stage', false],
    ]);
  });

  it('publishes nothing when a first publish has no bootstrap token', async () => {
    const deps = depsWith({ '@nizam-os/ban-core': PRESENT });
    await expect(publishAll(MANIFEST, deps)).rejects.toThrow(
      "nothing was published: @nizam-os/hono-ban is not on npm yet, and trusted publishing cannot stage a package's first version",
    );
    expect(deps.calls).toEqual([]);
  });

  it('skips a version npm holds with the same integrity, so a rerun goes on from there', async () => {
    const deps = depsWith({
      '@nizam-os/ban-core': {
        exists: true,
        versions: new Map([['0.1.0', INTEGRITY]]),
      },
      '@nizam-os/hono-ban': PRESENT,
    });
    const outcomes = await publishAll(MANIFEST, deps);
    expect(outcomes.map(({ result }) => result)).toEqual([
      'already on npm',
      'staged',
    ]);
    expect(deps.calls).toHaveLength(1);
  });

  it('publishes nothing when npm holds a version with other content, and names every blocker', async () => {
    const deps = depsWith({
      '@nizam-os/ban-core': PRESENT,
      '@nizam-os/hono-ban': {
        exists: true,
        versions: new Map([['1.4.0', OTHER]]),
      },
    });
    await expect(publishAll(MANIFEST, deps)).rejects.toThrow(
      'nothing was published: npm holds @nizam-os/hono-ban@1.4.0 with other content than this release built',
    );
    expect(deps.calls).toEqual([]);
    await expect(
      publishAll(MANIFEST, depsWith({ '@nizam-os/hono-ban': PRESENT })),
    ).rejects.toThrow(
      /^nothing was published: @nizam-os\/ban-core is not on npm yet, .*\(CONTRIBUTING, "Releases"\)$/u,
    );
  });

  it('stops at the first npm failure, before the packages that depend on it', async () => {
    let runs = 0;
    const deps = depsWith(
      { '@nizam-os/ban-core': PRESENT, '@nizam-os/hono-ban': PRESENT },
      {
        npm: () => {
          runs += 1;
          return { status: 1, stdout: '' };
        },
      },
    );
    await expect(publishAll(MANIFEST, deps)).rejects.toThrow(
      'npm stage publish of @nizam-os/ban-core@0.1.0 failed with exit code 1',
    );
    expect(runs).toBe(1);
  });

  it('stops when npm reports another integrity than the tarball checked', async () => {
    const deps = depsWith(
      { '@nizam-os/ban-core': PRESENT, '@nizam-os/hono-ban': PRESENT },
      {
        npm: () => ({
          status: 0,
          stdout: JSON.stringify({
            '@nizam-os/ban-core': { integrity: OTHER },
          }),
        }),
      },
    );
    await expect(publishAll(MANIFEST, deps)).rejects.toThrow(
      'npm stage publish sent @nizam-os/ban-core@0.1.0 with another integrity than the tarball checked',
    );
  });
});

describe('publishSummary', () => {
  it('lists each release and says how a staged one goes live', () => {
    const summary = publishSummary([
      { release: CORE, result: 'published' },
      { release: BINDING, result: 'staged', stageId: 's1' },
    ]);
    expect(summary).toContain(
      '- `@nizam-os/ban-core@0.1.0` (latest): published\n',
    );
    expect(summary).toContain(
      '- `@nizam-os/hono-ban@1.4.0` (latest): staged, stage `s1`\n',
    );
    expect(summary).toContain('`npm stage approve <stage id>`');
  });

  it('says nothing of approval when nothing was staged', () => {
    expect(publishSummary([{ release: CORE, result: 'already on npm' }])).toBe(
      '## npm\n\n- `@nizam-os/ban-core@0.1.0` (latest): already on npm\n',
    );
  });
});
