/**
 * The notes of a release: the section Changesets wrote for its version in the
 * package's CHANGELOG.md, a level-two heading that is the version, up to the
 * next level-two heading. The GitHub release of the version carries them.
 * @ref https://github.com/changesets/changesets/blob/main/packages/apply-release-plan/src/index.ts
 * @packageDocumentation
 */

const HEADING = /^## (?<title>.+?)\s*$/u;

/**
 * The section of `version` in the text of a CHANGELOG.md, without its heading;
 * `undefined` when the changelog has no section for it or the section is empty.
 */
export function releaseNotes(
  changelog: string,
  version: string,
): string | undefined {
  const lines = changelog.split(/\r?\n/u);
  const start = lines.findIndex(
    (line) => HEADING.exec(line)?.groups?.['title'] === version,
  );
  if (start === -1) {
    return undefined;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => HEADING.test(line));
  const notes = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return notes === '' ? undefined : notes;
}
