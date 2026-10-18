# ADR 0004: Protect main with one aggregate check

- Status: superseded by ADR-0012 (main is written by the export alone)
- Date: 2026-10-10
- Amended: 2026-10-10, admin bypass removed after #63 merged before its checks finished
- Amended: 2026-10-09, rebase merges allowed for pull requests that carry one commit per issue

## Context

Every change reaches `main` through a pull request, and in a repository with one maintainer CI is
the reviewer that never skips a step. The CI workflow is a job matrix whose names change whenever a
family, a Node.js version, or a PostgreSQL version is added. Requiring the jobs by name would need a
ruleset change with every matrix change, and a job left off the list would stop being required
without anyone noticing.

GitHub reports a job skipped by its own `if` condition as successful, and a job skipped because a
job it needs failed may not block a merge; required checks that depend on other jobs should use
`always()` with `needs`
([troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)).
`needs.<job_id>.result` is one of `success`, `failure`, `cancelled`, or `skipped`
([contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context)).

A bypass actor with `bypass_mode: pull_request` may merge a pull request that does not satisfy the
rules, and the merge API applies the bypass without asking: `gh pr merge` merged #63 while its
checks were still running, because the merging account is an organization admin.

One pull request per issue spent most of an epic's time on pull request overhead and repeated CI
runs. Grouping an epic's issues into one pull request keeps one commit per issue only when that pull
request is rebased onto `main` rather than squashed. Rebase merges keep the history linear
([about merge methods](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github)).

The release workflow opens the "Version Packages" pull request with the repository `GITHUB_TOKEN`.
The workflow runs for that pull request are created in the `action_required` state and wait for a
maintainer to approve them in the Actions tab.

## Decision

- The `protect main` ruleset requires a pull request, allows squash and rebase merges (no merge
  commits), requires linear history, and requires one status check, `CI passed`, with the strict
  policy: a branch must be up to date with `main` before it merges. It keeps blocking deletion and
  force pushes.
- `CI passed` is the last job of `.github/workflows/ci.yml`. It needs every other job, runs with
  `if: always()`, and fails when any of them failed or was cancelled. A change that adds a CI job
  adds it to that `needs` list.
- The ruleset has no bypass actors, so the required check holds for admins and for tools acting as
  them. Nobody pushes to `main` directly. In an emergency an admin disables the ruleset, merges, and
  enables it again.
- A pull request that carries one commit per issue, each passing the gates on its own, merges with
  rebase so `main` keeps one commit per issue; a single-commit pull request may squash. Auto-merge
  is enabled for the repository, so `gh pr merge --auto --rebase` merges once `CI passed` succeeds.
- To release, approve the held runs of the "Version Packages" pull request, wait for `CI passed`,
  then merge it.

## Consequences

- A new matrix entry needs no ruleset change. A new job needs its `needs` entry; without it the job
  is advisory only, which the review of the workflow diff has to catch.
- Under the strict policy, a pull request that was opened before another one merged needs
  `gh pr update-branch <number>` and a fresh CI run before it can merge.
- A GitHub App installation token for the changesets action would let the "Version Packages" pull
  request run CI without approval. Revisit when releases become frequent.
