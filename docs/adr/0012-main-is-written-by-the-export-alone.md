# ADR 0012: Main is written by the export alone

- Status: accepted
- Date: 2026-10-18
- Amended: 2026-10-18 by ADR 0014, tags need write access and secret scanning runs without
  non-provider patterns and validity checks, which GitHub does not accept on the organization's plan

## Context

The kit is developed as one tree of the Nizam suite's repository, and this repository is written
from it by an export that carries the tree's history (see CONTRIBUTING, "This repository is a
mirror"). The export rewrites what it publishes for the public, checks every commit's authors,
message, added lines and paths, the links and the secrets in what it would push, and pushes only
what a maintainer has read and confirmed. It reproduces the commits it published before exactly, so
each export is a fast-forward of `main`, and it refuses a `main` that holds a commit it did not
make.

ADR 0004 protected `main` for a repository that took pull requests: a required pull request, a
required `CI passed` check, linear history. A mirror takes no commits of its own. A pull request
merged here would be a commit the export cannot reproduce, and the export's merge commits are not
linear history.

GitHub rulesets restrict who may create, update or delete matching refs, and a ruleset's bypass list
names who is exempt from all of its rules; deploy keys and GitHub Apps can be bypass actors
([About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets),
[creating rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)).

## Decision

- **`main` is updated by the export's deploy key only.** The ruleset "main: written by the export
  only" restricts updates to `main`, with deploy keys as its one bypass actor, and the repository
  has one deploy key, the export's. A pull request is reviewed here, lands in the suite's repository
  with its author kept, and reaches `main` with the next export.
- **Nobody rewrites or deletes `main`, the deploy key included** ("main: never rewritten or
  deleted"): what was published stays as published.
- **No other branch can be created** ("no branch but main"). Dependabot's version updates are off,
  since the dependency versions come from the suite's catalog, and its security alerts stay on.
- **Tags are created by the release workflow only and are never moved or deleted** ("tags: created
  by the release workflow only", "tags: never moved or deleted"); releases are immutable.
- **Actions run only GitHub's own actions and the setup actions of pnpm, Bun and Deno**, each pinned
  to a full commit SHA. The default workflow token is read-only and cannot approve pull requests,
  and a workflow run for a pull request of an outside contributor waits for a maintainer's approval.
- **Secret scanning** runs with push protection, the non-provider patterns and validity checks, and
  private vulnerability reporting is on.

The suite's repository holds these settings as data and checks the repository against them.

## Consequences

- ADR 0004 is superseded. No ruleset requires `CI passed`; the job stays the one status a pull
  request shows.
- A pull request never merges here. A maintainer applies it where the kit is developed, with its
  author as the commit's author, and closes it with a link to the exported commit.
- A change to these settings is a new ADR here and a change to the settings data in the suite.
