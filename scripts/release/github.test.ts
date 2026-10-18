import { describe, expect, it } from 'vitest';

import { ghApi } from './github.ts';

interface Call {
  readonly args: ReadonlyArray<string>;
  readonly input?: string;
}

function ghWith(
  status: number | null,
  stdout = '',
  stderr = '',
): { calls: Array<Call>; github: ReturnType<typeof ghApi> } {
  const calls: Array<Call> = [];
  const github = ghApi((command, args, options) => {
    expect(command).toBe('gh');
    calls.push({
      args,
      ...(options.input === undefined ? {} : { input: options.input }),
    });
    return { status, stdout, stderr };
  });
  return { calls, github };
}

describe('ghApi', () => {
  it('gets a resource with the API version pinned', () => {
    const { calls, github } = ghWith(0, '{"a":1}\n');
    expect(github.get('repos/o/r/git/ref/tags/x')).toEqual({ a: 1 });
    expect(calls[0]?.args).toEqual([
      'api',
      '--method',
      'GET',
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2022-11-28',
      'repos/o/r/git/ref/tags/x',
    ]);
  });

  it('reads a 404 as undefined and an empty body as null', () => {
    expect(
      ghWith(1, '', 'gh: Not Found (HTTP 404)').github.get('x'),
    ).toBeUndefined();
    expect(ghWith(0, '').github.get('x')).toBeNull();
  });

  it('names the call and the status of any other failure', () => {
    expect(() =>
      ghWith(1, '', 'gh: Forbidden (HTTP 403)').github.get('repos/o/r'),
    ).toThrow('gh api GET repos/o/r failed with HTTP 403');
    expect(() => ghWith(1, '', 'no network').github.get('repos/o/r')).toThrow(
      'gh api GET repos/o/r failed',
    );
  });

  it('posts a body on standard input', () => {
    const { calls, github } = ghWith(0, '{"id":7}');
    expect(github.post('repos/o/r/releases', { tag_name: 't' })).toEqual({
      id: 7,
    });
    expect(calls[0]?.args.slice(-3)).toEqual([
      'repos/o/r/releases',
      '--input',
      '-',
    ]);
    expect(calls[0]?.input).toBe('{"tag_name":"t"}');
  });

  it('lists every item of every page', () => {
    const { calls, github } = ghWith(0, '[[{"n":1},{"n":2}],[{"n":3}]]');
    expect(github.list('repos/o/r/releases')).toEqual([
      { n: 1 },
      { n: 2 },
      { n: 3 },
    ]);
    expect(calls[0]?.args).toContain('--paginate');
    expect(calls[0]?.args).toContain('--slurp');
    expect(ghWith(1, '', '(HTTP 404)').github.list('x')).toEqual([]);
    expect(() => ghWith(0, '{"n":1}').github.list('x')).toThrow(
      'gh api GET x answered something other than pages of a list',
    );
  });
});
