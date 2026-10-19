# ADR 0015: A trusted publisher is configured for the release that first stages its package

- Status: accepted
- Date: 2026-10-18

## Context

ADR 0013 publishes a package's first version with a bootstrap token, which the maintainer revokes
once the new package "has its trusted publisher". CONTRIBUTING had the maintainer configure that
trusted publisher right after the first version was on npm. Two facts of npm's make that order fail:

- "A newly created trusted publisher configuration must complete its first successful publish within
  2 days. [...] If the configuration is not validated within 2 days, it expires and can no longer be
  used or edited"
  ([trusted publisher configuration expiry](https://docs.npmjs.com/trusted-publishers)). A trusted
  publisher configured after a package's first version is used at its second, which comes when the
  package changes, not within 2 days.
- "npm does not verify your trusted publisher configuration when you save it", and its errors "will
  only appear when you attempt to publish" (same page). npm's CLI exchanges the job's OIDC token for
  a publish token one package at a time, and a refused exchange does not stop it: `oidc()` in npm
  11.19 logs the failure and returns
  ([`oidc.js`](https://github.com/npm/cli/blob/v11.19.0/lib/utils/oidc.js)), and the stage then
  fails as unauthenticated, without the cause. A release whose third package has no trusted
  publisher stops after staging the first two.

The publish job already refuses to start a release that would stop halfway for a reason known in
advance: a version npm holds with other content, or a first version without a token (ADR 0013). A
package with no trusted publisher for this workflow is such a reason, and npm can be asked about it
before anything is staged: the exchange npm's CLI makes is
`POST /-/npm/v1/oidc/token/exchange/package/{name}` with the job's OIDC token for the audience
`npm:registry.npmjs.org`, which npm answers with a token (201) or an error status
([npm API](https://api-docs.npmjs.com/#tag/OIDC/operation/exchangeOidcToken);
[GitHub's OIDC token](https://docs.github.com/en/actions/reference/security/oidc)).

## Decision

- **A package's trusted publisher is configured at most 2 days before the release that first stages
  the package**, its second version, and that staged version is approved within the same 2 days: npm
  does not say whether the stage or the approval is the "first successful publish" that validates a
  configuration that may only stage. The configuration still only stages (`--allow-stage-publish`,
  without `--allow-publish`).
- **Once a package's first version is on npm, its publishing access is "Require two-factor
  authentication and disallow tokens"** (`npm access set mfa=publish`), and the bootstrap token is
  revoked. Until its trusted publisher is configured, only a maintainer with two-factor
  authentication can publish the package; npm says the setting does not affect trusted publishers.
- **Before staging anything, the publish job asks npm whether the trusted publisher of each package
  it would stage accepts this workflow** (`scripts/release/trust.ts`): it requests the job's OIDC
  token from GitHub and exchanges it for that package. When npm refuses an exchange (a 4xx status),
  answers it otherwise, or cannot be reached, the release stops before anything is staged, and the
  error names each such package and, for a refusal, says that its trusted publisher is missing or
  expired. The token npm returns is neither used nor kept: npm's CLI exchanges its own when it
  stages.

## Consequences

- ADR 0013 is amended: the bootstrap token is revoked once a package's first version is on npm with
  that publishing access, and the package's trusted publisher comes with its next release
  (CONTRIBUTING, "Releases").
- A missing or expired trusted publisher stops a release before it starts, with the package's name;
  the maintainer configures it, or deletes the expired one and configures it again, and reruns the
  release.
- The publish job makes two more requests per package it stages, one to GitHub and one to npm.
- The check depends on npm's exchange endpoint, which npm's CLI uses but npm does not document as a
  way to ask. If npm moves it, every release that stages a package stops before it starts, and the
  check follows the endpoint.
