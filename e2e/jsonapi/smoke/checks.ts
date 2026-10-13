/**
 * Runtime-neutral assertions over the blog app (SPEC 13.2). `dispatch` is
 * `app.request()` inside Bun or Deno, or Miniflare's `dispatchFetch()` for
 * workerd, so only the response surface every runtime shares is used here.
 * This module imports nothing: the Node harness for workerd loads it
 * without pulling the worker's dependencies into the host process.
 */

interface ResponseLike {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

interface DispatchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export type Dispatch = (
  path: string,
  init?: DispatchInit,
) => Promise<ResponseLike>;

export interface SmokeResult {
  readonly runtime: string;
  readonly passed: number;
  readonly failures: ReadonlyArray<string>;
}

type Json = Record<string, unknown>;
type Check = (dispatch: Dispatch) => Promise<void>;

const JSON_API = 'application/vnd.api+json';
const ATOMIC = 'https://jsonapi.org/ext/atomic';
const PROFILE = 'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/';

class CheckFailure extends Error {
  override readonly name: string = 'CheckFailure';
}

export function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new CheckFailure(message);
  }
}

export function equal(actual: unknown, expected: unknown, what: string): void {
  check(
    actual === expected,
    `${what}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
}

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function json(res: ResponseLike): Promise<Json> {
  const parsed: unknown = JSON.parse(await res.text());
  check(isJson(parsed), 'body is a JSON object');
  return parsed;
}

function member(value: unknown, key: string): unknown {
  return isJson(value) ? value[key] : undefined;
}

function list(value: unknown, what: string): Array<unknown> {
  check(Array.isArray(value), `${what} is an array`);
  return value;
}

function jsonApiRequest(
  method: string,
  body: unknown,
  contentType = JSON_API,
): DispatchInit {
  return {
    method,
    headers: { 'content-type': contentType, accept: JSON_API },
    body: JSON.stringify(body),
  };
}

const CHECKS: Readonly<Record<string, Check>> = {
  'resource document with compound data': async (dispatch) => {
    const res = await dispatch(
      '/articles/1?include=author&fields[people]=name',
    );
    equal(res.status, 200, 'status');
    equal(res.headers.get('content-type'), JSON_API, 'content-type');
    equal(res.headers.get('vary'), 'Accept', 'vary');
    const body = await json(res);
    equal(member(body['data'], 'id'), '1', 'data.id');
    const [author] = list(body['included'], 'included');
    equal(
      member(member(author, 'attributes'), 'name'),
      'Dan Gebhardt',
      'included author',
    );
  },
  'paginated collection with the profile': async (dispatch) => {
    const res = await dispatch('/articles?page[size]=2&sort=-title');
    equal(res.status, 200, 'status');
    equal(
      res.headers.get('content-type'),
      `${JSON_API}; profile="${PROFILE}"`,
      'content-type',
    );
    const body = await json(res);
    equal(list(body['data'], 'data').length, 2, 'page size');
    check(typeof member(body['links'], 'next') === 'string', 'next link');
    equal(member(member(body['meta'], 'page'), 'total'), 5, 'meta.page.total');
  },
  'query errors list every parameter': async (dispatch) => {
    const res = await dispatch('/articles?sort=nope&bogus=1');
    equal(res.status, 400, 'status');
    const errors = list((await json(res))['errors'], 'errors');
    equal(errors.length, 2, 'error count');
    equal(
      member(member(errors[0], 'source'), 'parameter'),
      'sort',
      'first parameter',
    );
  },
  'content negotiation': async (dispatch) => {
    const res = await dispatch('/articles/1', {
      headers: { 'content-type': `${JSON_API}; charset=utf-8` },
    });
    equal(res.status, 415, '415 status');
    const notAcceptable = await dispatch('/articles/1', {
      headers: { accept: `${JSON_API}; charset=utf-8` },
    });
    equal(notAcceptable.status, 406, '406 status');
  },
  'create with validation and Location': async (dispatch) => {
    const invalid = await dispatch(
      '/articles',
      jsonApiRequest('POST', { data: { type: 'articles', attributes: {} } }),
    );
    equal(invalid.status, 422, 'validation status');
    const [issue] = list((await json(invalid))['errors'], 'errors');
    equal(
      member(member(issue, 'source'), 'pointer'),
      '/data/attributes/title',
      'pointer',
    );
    const created = await dispatch(
      '/articles',
      jsonApiRequest('POST', {
        data: { type: 'articles', attributes: { title: 'Smoke' } },
      }),
    );
    equal(created.status, 201, 'created status');
    equal(
      created.headers.get('location'),
      'https://blog.example/articles/6',
      'location',
    );
  },
  'relationship update': async (dispatch) => {
    const res = await dispatch(
      '/articles/1/relationships/author',
      jsonApiRequest('PATCH', { data: { type: 'people', id: '3' } }),
    );
    equal(res.status, 204, 'status');
    const linkage = await json(
      await dispatch('/articles/1/relationships/author'),
    );
    equal(member(linkage['data'], 'id'), '3', 'linkage id');
  },
  'atomic operations with a lid': async (dispatch) => {
    const res = await dispatch('/operations', {
      method: 'POST',
      headers: { 'content-type': `${JSON_API}; ext="${ATOMIC}"` },
      body: JSON.stringify({
        'atomic:operations': [
          {
            op: 'add',
            data: { type: 'people', lid: 'p', attributes: { name: 'Smoke' } },
          },
          {
            op: 'add',
            data: {
              type: 'articles',
              attributes: { title: 'Atomic' },
              relationships: { author: { data: { type: 'people', lid: 'p' } } },
            },
          },
        ],
      }),
    });
    equal(res.status, 200, 'status');
    equal(
      res.headers.get('content-type'),
      `${JSON_API}; ext="${ATOMIC}"`,
      'content-type',
    );
    const results = list((await json(res))['atomic:results'], 'atomic:results');
    equal(results.length, 2, 'result count');
    const author = member(
      member(member(member(results[1], 'data'), 'relationships'), 'author'),
      'data',
    );
    equal(
      member(author, 'id'),
      member(member(results[0], 'data'), 'id'),
      'lid resolved',
    );
  },
  'unmatched route and unexpected error': async (dispatch) => {
    const missing = await dispatch('/nowhere');
    equal(missing.status, 404, '404 status');
    equal(missing.headers.get('content-type'), JSON_API, '404 content-type');
    const boom = await dispatch('/boom');
    equal(boom.status, 500, '500 status');
    check(!(await boom.text()).includes('secret'), 'nothing leaks');
  },
};

/** Runs every check and collects failures so one report covers them all. */
export async function runChecks(dispatch: Dispatch): Promise<SmokeResult> {
  const runtime = await (await dispatch('/runtime')).text();
  const failures: Array<string> = [];
  let passed = 0;
  for (const [name, run] of Object.entries(CHECKS)) {
    try {
      await run(dispatch);
      passed += 1;
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { runtime, passed, failures };
}

/** A check that runs inside the runtime under test, against a blog of its own. */
export type InRuntimeCheck = () => Promise<void>;

/** Runs each check in the current runtime; one report covers them all. */
export async function runInRuntime(
  checks: Readonly<Record<string, InRuntimeCheck>>,
): Promise<SmokeResult> {
  const failures: Array<string> = [];
  let passed = 0;
  for (const [name, run] of Object.entries(checks)) {
    try {
      await run();
      passed += 1;
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { runtime: navigator.userAgent, passed, failures };
}

/**
 * The checks the app runs inside the runtime under test and answers at
 * `path`: the client's at `/client-checks` (`client-checks.ts`), and the
 * TanStack Query binding's at `/query-checks` (`query-checks.ts`).
 */
export async function routeChecks(
  dispatch: Dispatch,
  path: string,
): Promise<SmokeResult> {
  const res = await dispatch(path);
  equal(res.status, 200, `${path} status`);
  const body = await json(res);
  const { runtime, passed } = body;
  const failures = list(body['failures'], 'failures');
  check(
    typeof runtime === 'string' && typeof passed === 'number',
    `${path} reports a runtime and a count`,
  );
  return { runtime, passed, failures: failures.map(String) };
}

/** Prints the outcome for `name`; throws on failure so the process exits non-zero everywhere. */
export function report(
  result: SmokeResult,
  name = '@nizam-os/jsonapi-core',
): void {
  const total = result.passed + result.failures.length;
  if (result.failures.length === 0) {
    console.log(`${name} smoke: ${total} checks passed on ${result.runtime}`);
    return;
  }
  for (const failure of result.failures) {
    console.error(`FAIL ${failure}`);
  }
  throw new Error(
    `${name} smoke: ${result.failures.length} of ${total} checks failed on ${result.runtime}`,
  );
}
