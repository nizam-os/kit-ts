import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s[^'";]*?from\s+'(?<specifier>[^']+)'|(?:^|\n)\s*import\s+'(?<bare>[^']+)'/gu;

/** Every module specifier a file imports, following its relative imports. */
function importsOf(file: string, seen = new Set<string>()): Set<string> {
  const specifiers = new Set<string>();
  if (seen.has(file)) {
    return specifiers;
  }
  seen.add(file);
  for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    const specifier =
      match.groups?.['specifier'] ?? match.groups?.['bare'] ?? '';
    if (specifier.startsWith('./')) {
      for (const nested of importsOf(
        join(import.meta.dirname, specifier),
        seen,
      )) {
        specifiers.add(nested);
      }
    } else {
      specifiers.add(specifier);
    }
  }
  return specifiers;
}

describe('the publish and GitHub release jobs', () => {
  // They run on a checkout without `pnpm install`: a dependency, or a module
  // that imports one, would fail there, and would run a package's code in the
  // job that can publish.
  it.each(['publish.ts', 'github-release.ts'])(
    '%s imports Node builtins only',
    (entry) => {
      const specifiers = [...importsOf(join(import.meta.dirname, entry))];
      expect(specifiers.length).toBeGreaterThan(0);
      expect(
        specifiers.filter((specifier) => !specifier.startsWith('node:')),
      ).toEqual([]);
    },
  );

  it('pack.ts does import dependencies, so the walk sees them', () => {
    expect([...importsOf(join(import.meta.dirname, 'pack.ts'))]).toContain(
      'semver',
    );
  });
});
