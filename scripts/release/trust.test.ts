import { describe, expect, it } from 'vitest';

import { audienceOf, exchangeUrl, trustChecker } from './trust.ts';

const ENV = {
  ACTIONS_ID_TOKEN_REQUEST_URL:
    'https://token.actions.example/request?api-version=2.0',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token',
};

interface Request {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
}

/** A fetch that records each request and answers from `answers`, one per call, in order. */
function fetchAnswering(
  ...answers: Array<Response | Error>
): typeof fetch & { readonly requests: Array<Request> } {
  const requests: Array<Request> = [];
  const fake = async (
    input: string | URL | globalThis.Request,
    init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve();
    requests.push({
      url:
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      method: init?.method ?? 'GET',
      authorization: new Headers(init?.headers).get('authorization'),
    });
    const answer = answers.shift();
    if (answer === undefined) {
      throw new Error('no answer left');
    }
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  };
  return Object.assign(fake, { requests });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('audienceOf and exchangeUrl', () => {
  it('name the audience npm requires and its exchange for a package, as npm does', () => {
    expect(audienceOf()).toBe('npm:registry.npmjs.org');
    expect(exchangeUrl('@nizam-os/hono-ban')).toBe(
      'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@nizam-os%2fhono-ban',
    );
    expect(exchangeUrl('hono-ban', 'http://localhost:4873')).toBe(
      'http://localhost:4873/-/npm/v1/oidc/token/exchange/package/hono-ban',
    );
  });
});

describe('trustChecker', () => {
  it('accepts a package whose trusted publisher npm exchanges the OIDC token for', async () => {
    const fetchImpl = fetchAnswering(
      json({ count: 1, value: 'id-token' }),
      json({ token_type: 'oidc', token: 'npm-token' }, 201),
    );
    await expect(
      trustChecker(ENV, fetchImpl)('@nizam-os/hono-ban'),
    ).resolves.toEqual({ accepted: true });
    expect(fetchImpl.requests).toEqual([
      {
        url: 'https://token.actions.example/request?api-version=2.0&audience=npm%3Aregistry.npmjs.org',
        method: 'GET',
        authorization: 'Bearer request-token',
      },
      {
        url: 'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@nizam-os%2fhono-ban',
        method: 'POST',
        authorization: 'Bearer id-token',
      },
    ]);
  });

  it('refuses without asking when the job cannot request an OIDC token', async () => {
    const fetchImpl = fetchAnswering();
    await expect(trustChecker({}, fetchImpl)('@nizam-os/a')).resolves.toEqual({
      accepted: false,
      reason:
        'the job cannot request an OIDC token from GitHub: it needs the id-token: write permission',
    });
    await expect(
      trustChecker(
        { ...ENV, ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' },
        fetchImpl,
      )('@nizam-os/a'),
    ).resolves.toMatchObject({ accepted: false });
    expect(fetchImpl.requests).toEqual([]);
  });

  it('names npm refusing the exchange, and what to do about it', async () => {
    for (const status of [400, 401, 404]) {
      const answer = await trustChecker(
        ENV,
        fetchAnswering(json({ value: 'id-token' }), json({}, status)),
      )('@nizam-os/a');
      expect(answer).toEqual({
        accepted: false,
        reason:
          `npm's token exchange answered ${status}: the package has no trusted publisher for this ` +
          'workflow, or it expired unused; configure it at most 2 days before the release ' +
          '(CONTRIBUTING, "Releases") and rerun',
      });
    }
  });

  it('names a failure that says nothing of the trusted publisher by its call and status or type', async () => {
    const answers = await Promise.all([
      trustChecker(ENV, fetchAnswering(json({}, 503)))('@nizam-os/a'),
      trustChecker(ENV, fetchAnswering(json({ value: '' })))('@nizam-os/a'),
      trustChecker(ENV, fetchAnswering(json(['id-token'])))('@nizam-os/a'),
      trustChecker(
        ENV,
        fetchAnswering(new Response('<html>', { status: 200 })),
      )('@nizam-os/a'),
      trustChecker(
        ENV,
        fetchAnswering(new TypeError('fetch failed: https://token.example')),
      )('@nizam-os/a'),
      trustChecker(
        { ...ENV, ACTIONS_ID_TOKEN_REQUEST_URL: 'not a url' },
        fetchAnswering(),
      )('@nizam-os/a'),
      trustChecker(
        ENV,
        fetchAnswering(json({ value: 'id-token' }), json({}, 500)),
      )('@nizam-os/a'),
      trustChecker(
        ENV,
        fetchAnswering(json({ value: 'id-token' }), json({ token: 1 }, 201)),
      )('@nizam-os/a'),
      trustChecker(
        ENV,
        fetchAnswering(json({ value: 'id-token' }), new TypeError('reset')),
      )('@nizam-os/a'),
    ]);
    expect(answers.map((answer) => answer.accepted || answer.reason)).toEqual([
      'GitHub answered 503 to the OIDC token request',
      "GitHub's answer to the OIDC token request holds no token",
      "GitHub's answer to the OIDC token request holds no token",
      "GitHub's answer to the OIDC token request holds no token",
      'the OIDC token request failed (TypeError)',
      'the OIDC token request failed (TypeError)',
      "npm's token exchange answered 500",
      "npm's answer to the token exchange holds no token",
      "npm's token exchange failed (TypeError)",
    ]);
  });

  it('names a thrown value that is not an error by its type', async () => {
    const fetchImpl = Object.assign(
      async (): Promise<Response> => {
        await Promise.resolve();
        // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- reason: a thrown value that is not an Error is the case under test
        throw 'refused';
      },
      { requests: [] },
    );
    await expect(trustChecker(ENV, fetchImpl)('@nizam-os/a')).resolves.toEqual({
      accepted: false,
      reason: 'the OIDC token request failed (string)',
    });
  });
});
