# ADR 0014: Tags need write access, and secret scanning uses what the plan includes

- Status: accepted
- Date: 2026-10-18

## Context

ADR 0012 limited the creation of tags to the release workflow, with a ruleset that GitHub Actions
bypasses, and turned on secret scanning's non-provider patterns and validity checks. Applying the
settings showed that GitHub accepts neither here:

- GitHub refuses the ruleset with HTTP 422: "Actor GitHub Actions integration must be part of the
  ruleset source or owner organization". A ruleset takes an app as a bypass actor only when the app
  is installed where the ruleset lives, and GitHub Actions, whose token a workflow's `GITHUB_TOKEN`
  is, is not an installed app.
- Validity checks "are only available to users with GitHub Team or GitHub Enterprise who enable the
  feature as part of GitHub Secret Protection"
  ([supported patterns](https://docs.github.com/en/code-security/secret-scanning/introduction/supported-secret-scanning-patterns)),
  and non-provider patterns are part of the same product
  ([changelog](https://github.blog/changelog/2024-10-04-secret-scanning-non-provider-patterns-are-generally-available/)).
  The organization is on GitHub's free plan: the request that enables them succeeds, and both stay
  disabled.

## Decision

- **Tags are never moved or deleted, and creating one needs write access.** The ruleset "tags: never
  moved or deleted" stays; "tags: created by the release workflow only" is dropped. Write access is
  the maintainer's account and the release workflow's "Tag and GitHub releases" job, the one job
  whose token can write contents. Releases stay immutable.
- **Secret scanning runs with push protection**, which public repositories get on every plan,
  without non-provider patterns and validity checks.

## Consequences

- ADR 0012 is amended in these two points.
- A tag does not publish anything: the release workflow publishes on a push to `main` and tags each
  version once npm serves it. A tag created by hand at another commit stops the release job, which
  refuses a tag that does not point to the commit its tarballs were built from, and since no tag can
  be moved or deleted, it stays visible.
- What every push publishes is still scanned before it leaves: the export runs gitleaks over every
  commit, message and tree it would push, and the release over each tarball. GitHub's non-provider
  patterns would only report a secret already public.
- If the organization gets GitHub Secret Protection, the two features come back in the settings with
  a new ADR.
