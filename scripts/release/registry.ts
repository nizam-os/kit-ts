/**
 * What npm holds of a package: whether it exists, and the integrity of each
 * version it has. The read asks for the registry's current document, past its
 * CDN cache (`?write=true`, as npm itself does before changing a package), so
 * a version published a minute ago is seen. Node's builtins only: the publish
 * and GitHub release jobs read it without installing anything.
 * @ref https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md#getpackage
 * @ref https://github.com/npm/cli/blob/v11.21.1/lib/commands/deprecate.js (the `write: true` query)
 * @packageDocumentation
 */

/** A package npm does not have, or the integrity of each version it does. */
export type RegistryState =
  | { readonly exists: false }
  | {
      readonly exists: true;
      readonly versions: ReadonlyMap<string, string | undefined>;
    };

/** Reads a package's state from the registry. */
export type ReadRegistry = (name: string) => Promise<RegistryState>;

/** The registry the kit publishes to. */
export const REGISTRY = 'https://registry.npmjs.org';

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The URL of a package's document: a scoped name keeps its `@` and escapes its `/`. */
export function packumentUrl(
  name: string,
  registry: string = REGISTRY,
): string {
  return `${registry}/${encodeURIComponent(name).replace(/^%40/u, '@')}?write=true`;
}

/** The integrity of each version of a registry document. */
export function versionsOf(
  document: unknown,
  name: string,
): Map<string, string | undefined> {
  const versions: unknown = isObject(document)
    ? Reflect.get(document, 'versions')
    : undefined;
  if (!isObject(versions)) {
    throw new TypeError(`the registry's document of ${name} has no versions`);
  }
  return new Map(
    Object.entries(versions).map(([version, manifest]: [string, unknown]) => {
      const dist: unknown = isObject(manifest)
        ? Reflect.get(manifest, 'dist')
        : undefined;
      const integrity: unknown = isObject(dist)
        ? Reflect.get(dist, 'integrity')
        : undefined;
      return [version, typeof integrity === 'string' ? integrity : undefined];
    }),
  );
}

/**
 * A registry reader that fetches packuments from `registry` with `fetchImpl`.
 */
export function registryReader(
  fetchImpl: typeof fetch = fetch,
  registry: string = REGISTRY,
): ReadRegistry {
  return async (name) => {
    const response = await fetchImpl(packumentUrl(name, registry), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.status === 404) {
      return { exists: false };
    }
    if (!response.ok) {
      throw new Error(`the registry answered ${response.status} for ${name}`);
    }
    return { exists: true, versions: versionsOf(await response.json(), name) };
  };
}
