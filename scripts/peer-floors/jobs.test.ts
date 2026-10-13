import type { Manifest } from './workspace.ts';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { peerFloors } from './floors.ts';
import { buildsOn, floorJobs, jobLines, workflowRuns } from './jobs.ts';
import { readWorkspace } from './workspace.ts';

const ROOT = join(import.meta.dirname, '..', '..');

function manifest(
  name: string,
  fields: Partial<Omit<Manifest, 'name'>> = {},
): Manifest {
  return {
    name,
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    ...fields,
  };
}

/** A host binding `@x/b` that builds on `@x/a`; both peer on `host`. */
const BINDINGS = [
  manifest('@x/a', {
    devDependencies: { host: '2.0.0' },
    peerDependencies: { host: '>=1.2.0' },
  }),
  manifest('@x/b', {
    dependencies: { '@x/core': 'workspace:^' },
    devDependencies: { '@x/a': 'workspace:^', host: '2.0.0' },
    peerDependencies: { '@x/a': '^0.1.0', host: '>=1.2.0' },
  }),
  manifest('@x/core', { dependencies: { '@x/a': 'workspace:^' } }),
];

function workflow(...runs: Array<string>): object {
  return { jobs: { floor: { steps: runs.map((run) => ({ run })) } } };
}

function problems(...runs: Array<string>): Array<string> {
  return floorJobs(
    peerFloors(BINDINGS),
    workflowRuns(workflow(...runs), BINDINGS),
  ).flatMap((result) =>
    'problem' in result ? [`${result.floor.package}: ${result.problem}`] : [],
  );
}

describe('jobLines', () => {
  it("splits each job's run steps into lines, and a job without steps into none", () => {
    expect(
      jobLines({
        jobs: {
          floor: {
            steps: [
              { uses: 'actions/checkout@v7' },
              { run: 'a && b\nc' },
              { run: 'd' },
            ],
          },
          reuse: { uses: './.github/workflows/other.yml' },
        },
      }),
    ).toEqual([
      { job: 'floor', lines: ['a ', ' b', 'c', 'd'] },
      { job: 'reuse', lines: [] },
    ]);
  });

  it('refuses a workflow without jobs', () => {
    expect(() => jobLines({ on: 'push' })).toThrow(
      new TypeError('the workflow must have jobs'),
    );
    expect(() => jobLines(null)).toThrow(
      new TypeError('the workflow must have jobs'),
    );
  });

  it('reads no lines from a job or a step that is not an object', () => {
    expect(
      jobLines({ jobs: { odd: 'x', steps: { steps: ['x', null] } } }),
    ).toEqual([
      { job: 'odd', lines: [] },
      { job: 'steps', lines: [] },
    ]);
  });
});

describe('buildsOn', () => {
  it('follows every dependency field through the workspace, cycles included', () => {
    const byName = new Map(BINDINGS.map((entry) => [entry.name, entry]));
    expect([...buildsOn('@x/b', byName)].toSorted()).toEqual([
      '@x/a',
      '@x/core',
    ]);
    expect([...buildsOn('@x/core', byName)]).toEqual(['@x/a']);
    expect([...buildsOn('@x/unknown', byName)]).toEqual([]);
  });
});

describe('floorJobs', () => {
  it('finds the job that runs typecheck and test on the floor with one copy', () => {
    const add = 'pnpm --filter @x/a --filter @x/b add --save-dev host@1.2.0';
    const runs = workflowRuns(
      workflow(
        add,
        'pnpm --filter @x/a --filter @x/b run typecheck',
        'pnpm --filter @x/a --filter @x/b test',
      ),
      BINDINGS,
    );
    expect(
      floorJobs(peerFloors(BINDINGS), runs).map(
        (result) => 'job' in result && result.job,
      ),
    ).toEqual(['floor', 'floor']);
  });

  it('needs both scripts on the floor, after the add', () => {
    expect(
      problems(
        'pnpm --filter @x/a run typecheck',
        'pnpm --filter @x/a add --save-dev host@1.2.0',
        'pnpm --filter @x/a run test',
      ),
    ).toEqual([
      '@x/a: no CI job runs its typecheck and tests on host@1.2.0, the floor of host >=1.2.0',
      '@x/b: no CI job runs its typecheck and tests on host@1.2.0, the floor of host >=1.2.0',
    ]);
  });

  it('refuses a run beside another copy of the peer in a package it builds on', () => {
    expect(
      problems(
        'pnpm --filter @x/b add --save-dev host@1.2.0',
        'pnpm --filter @x/b run typecheck',
        'pnpm --filter @x/b run test',
      ),
    ).toEqual([
      '@x/a: no CI job runs its typecheck and tests on host@1.2.0, the floor of host >=1.2.0',
      '@x/b: job floor runs its typecheck on host@1.2.0 with another host in @x/a, which it builds on',
    ]);
  });

  it('keeps what earlier steps installed for the rest of the job', () => {
    expect(
      problems(
        'pnpm --filter @x/a add --save-dev host@1.2.0',
        'pnpm --filter @x/a run typecheck && pnpm --filter @x/a run test',
        'pnpm --filter @x/b add --save-dev host@1.2.0',
        'pnpm --filter @x/b run typecheck',
        'pnpm --filter @x/b run test',
      ),
    ).toEqual([]);
  });
});

describe("this repository's CI workflow", () => {
  const manifests = readWorkspace(ROOT);
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

  function check(text: string): Array<string> {
    return floorJobs(
      peerFloors(manifests),
      workflowRuns(parse(text), manifests),
    ).map((result) =>
      'job' in result
        ? `${result.floor.package} ${result.floor.peer}@${result.floor.floor}: ${result.job}`
        : `${result.floor.package}: ${result.problem}`,
    );
  }

  function mutated(from: string, to: string): string {
    expect(ci).toContain(from);
    return ci.split(from).join(to);
  }

  it('runs every floor', () => {
    expect(check(ci).filter((line) => !line.includes(': test-'))).toEqual([]);
  });

  it('fails when the Kysely step leaves kysely-keyset on another kysely', () => {
    const text = mutated(
      '--filter @nizam-os/kysely-keyset --filter @nizam-os/kysely-resource add',
      '--filter @nizam-os/kysely-resource add',
    );
    expect(check(text)).toContain(
      '@nizam-os/kysely-resource: job test-kysely-floor runs its typecheck on kysely@0.29.0 with another kysely in @nizam-os/kysely-keyset, which it builds on',
    );
  });

  it('fails when a floor job installs another version', () => {
    const lines = check(mutated('hono@4.13.7', 'hono@4.13.6'));
    expect(
      lines.filter((line) => line.includes('no CI job runs')),
    ).toHaveLength(3);
  });

  it('fails when a floor job drops its tests', () => {
    const text = mutated(
      '      - run: pnpm --filter @nizam-os/drizzle-keyset run test\n',
      '',
    );
    expect(check(text)).toContain(
      '@nizam-os/drizzle-keyset: no CI job runs its typecheck and tests on drizzle-orm@0.45.2, the floor of drizzle-orm >=0.45.2 <1.0.0',
    );
  });
});
