/**
 * Asks npm whether a package's trusted publisher accepts this workflow, the
 * way npm asks before a staged publish (root ADR 0015): the job requests an
 * OIDC token from GitHub for the registry's audience and offers it to npm's
 * token exchange for the package. npm answers with a short-lived token only
 * when a trusted publisher of the package matches the repository, the
 * workflow file and the environment, and has not expired: npm expires a
 * configuration that has not completed a successful publish within 2 days of
 * its creation. The token npm answers with is dropped unread.
 *
 * npm's own exchange never fails: refused, it stages without credentials, and
 * the stage fails with an authentication error that does not name the cause,
 * after the packages before it were staged. Asked first, the publish job
 * stops before it stages anything and names each package that cannot be
 * staged. Answers name the call and the HTTP status, never a URL, a token or
 * a body. Node's builtins only.
 * @ref https://docs.npmjs.com/trusted-publishers
 * @ref https://api-docs.npmjs.com/#tag/OIDC/operation/exchangeOidcToken
 * @ref https://github.com/npm/cli/blob/v11.19.0/lib/utils/oidc.js
 * @ref https://docs.github.com/en/actions/reference/security/oidc
 * @packageDocumentation
 */
import { REGISTRY } from './registry.ts';

/** npm's answer for one package: its trusted publisher accepts this workflow, or why it cannot stage. */
export type TrustAnswer =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: string };

/** Asks whether a package's trusted publisher accepts this workflow. */
export type CheckTrust = (name: string) => Promise<TrustAnswer>;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The audience npm requires of an OIDC token for `registry`. */
export function audienceOf(registry: string = REGISTRY): string {
  return `npm:${new URL(registry).hostname}`;
}

/** The URL of npm's token exchange for a package: a scoped name escapes its `/`, as npm does. */
export function exchangeUrl(name: string, registry: string = REGISTRY): string {
  return new URL(
    `/-/npm/v1/oidc/token/exchange/package/${name.replace('/', '%2f')}`,
    registry,
  ).href;
}

/** A non-empty string field of a JSON answer, or `undefined`. */
async function stringField(
  response: Response,
  field: string,
): Promise<string | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  const value: unknown = isObject(body) ? Reflect.get(body, field) : undefined;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** What failed, by its type alone: a fetch error's message may hold its URL. */
function failure(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** npm's refusal: no trusted publisher of the package accepts this workflow. */
function refused(status: number): TrustAnswer {
  return {
    accepted: false,
    reason:
      `npm's token exchange answered ${status}: the package has no trusted publisher for this ` +
      'workflow, or it expired unused; configure it at most 2 days before the release ' +
      '(CONTRIBUTING, "Releases") and rerun',
  };
}

/**
 * Checks trust from a job of `env`, whose `ACTIONS_ID_TOKEN_REQUEST_URL` and
 * `ACTIONS_ID_TOKEN_REQUEST_TOKEN` GitHub sets when the job may write an
 * id-token, against npm's exchange on `registry`, through `fetchImpl`.
 */
export function trustChecker(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
  registry: string = REGISTRY,
): CheckTrust {
  return async (name) => {
    const requestUrl = env['ACTIONS_ID_TOKEN_REQUEST_URL'] ?? '';
    const requestToken = env['ACTIONS_ID_TOKEN_REQUEST_TOKEN'] ?? '';
    if (requestUrl === '' || requestToken === '') {
      return {
        accepted: false,
        reason:
          'the job cannot request an OIDC token from GitHub: it needs the id-token: write permission',
      };
    }
    let idToken: string | undefined;
    try {
      const url = new URL(requestUrl);
      url.searchParams.append('audience', audienceOf(registry));
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${requestToken}`,
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        return {
          accepted: false,
          reason: `GitHub answered ${response.status} to the OIDC token request`,
        };
      }
      idToken = await stringField(response, 'value');
    } catch (error) {
      return {
        accepted: false,
        reason: `the OIDC token request failed (${failure(error)})`,
      };
    }
    if (idToken === undefined) {
      return {
        accepted: false,
        reason: "GitHub's answer to the OIDC token request holds no token",
      };
    }
    try {
      const response = await fetchImpl(exchangeUrl(name, registry), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        cache: 'no-store',
      });
      if (response.status >= 400 && response.status < 500) {
        return refused(response.status);
      }
      if (!response.ok) {
        return {
          accepted: false,
          reason: `npm's token exchange answered ${response.status}`,
        };
      }
      return (await stringField(response, 'token')) === undefined
        ? {
            accepted: false,
            reason: "npm's answer to the token exchange holds no token",
          }
        : { accepted: true };
    } catch (error) {
      return {
        accepted: false,
        reason: `npm's token exchange failed (${failure(error)})`,
      };
    }
  };
}
