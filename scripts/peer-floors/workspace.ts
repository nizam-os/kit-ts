/**
 * The workspace's package manifests, read from the directories the
 * `packages` globs of the nearest `pnpm-workspace.yaml` name. The file is
 * looked for in the tree's root and then in each directory above it, so the
 * tree reads the same on its own and as part of a larger workspace, and only
 * the packages under the tree are returned. Only the forms this repository
 * uses are read, a directory and `<directory>/*`; any other glob is a
 * `TypeError`, so a new form fails here instead of hiding packages from the
 * floor checks.
 * @ref https://pnpm.io/pnpm-workspace_yaml
 * @packageDocumentation
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { parse } from 'yaml';

/** The fields of a `package.json` the floor checks read. */
export interface Manifest {
  readonly name: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly peerDependencies: Readonly<Record<string, string>>;
}

const DIRECTORY = /^[\w.-]+(?:\/[\w.-]+)*$/u;
const CHILDREN = /^(?<directory>[\w.-]+(?:\/[\w.-]+)*)\/\*$/u;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ranges(
  value: unknown,
  what: string,
): Readonly<Record<string, string>> {
  if (value === undefined) {
    return {};
  }
  if (!isObject(value)) {
    throw new TypeError(`${what} must be an object`);
  }
  const result: Record<string, string> = {};
  for (const [name, range] of Object.entries(value)) {
    if (typeof range !== 'string') {
      throw new TypeError(`${what}.${name} must be a string`);
    }
    result[name] = range;
  }
  return result;
}

/** The dependency fields of a parsed `package.json`; `file` names it in errors. */
export function manifestOf(json: unknown, file: string): Manifest {
  if (!isObject(json)) {
    throw new TypeError(`${file} must hold an object`);
  }
  const name: unknown = Reflect.get(json, 'name');
  if (typeof name !== 'string') {
    throw new TypeError(`${file} must have a name`);
  }
  return {
    name,
    dependencies: ranges(
      Reflect.get(json, 'dependencies'),
      `${file} dependencies`,
    ),
    devDependencies: ranges(
      Reflect.get(json, 'devDependencies'),
      `${file} devDependencies`,
    ),
    peerDependencies: ranges(
      Reflect.get(json, 'peerDependencies'),
      `${file} peerDependencies`,
    ),
  };
}

/** Whether `directory` is `tree` or inside it; the empty tree is the whole workspace. */
function isUnder(directory: string, tree: string): boolean {
  return tree === '' || directory === tree || directory.startsWith(`${tree}/`);
}

/**
 * The package directories, relative to the workspace root, that the
 * `packages` globs name, kept to those under `tree` (a directory relative to
 * the root; the empty string is the whole workspace). A glob that cannot
 * reach the tree is not read, so a sibling tree need not exist on disk.
 */
export function packageDirectories(
  globs: unknown,
  root: string,
  tree = '',
): Array<string> {
  if (!Array.isArray(globs)) {
    throw new TypeError('pnpm-workspace.yaml must list its packages');
  }
  const directories: Array<string> = [];
  for (const glob of globs) {
    if (typeof glob !== 'string') {
      throw new TypeError('pnpm-workspace.yaml packages must be strings');
    }
    const children = CHILDREN.exec(glob)?.groups?.['directory'];
    if (children !== undefined) {
      if (!isUnder(children, tree) && !isUnder(tree, children)) {
        continue;
      }
      const entries = readdirSync(join(root, children), {
        withFileTypes: true,
      });
      for (const entry of entries) {
        const directory = `${children}/${entry.name}`;
        if (
          entry.isDirectory() &&
          isUnder(directory, tree) &&
          existsSync(join(root, directory, 'package.json'))
        ) {
          directories.push(directory);
        }
      }
    } else if (DIRECTORY.test(glob)) {
      if (isUnder(glob, tree)) {
        directories.push(glob);
      }
    } else {
      throw new TypeError(
        `the packages glob ${glob} is not one the floor checks read`,
      );
    }
  }
  return directories.toSorted();
}

/** The nearest directory at or above `start` that holds a `pnpm-workspace.yaml`. */
export function workspaceRoot(start: string): string {
  let directory = resolve(start);
  while (!existsSync(join(directory, 'pnpm-workspace.yaml'))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new TypeError(`no pnpm-workspace.yaml at or above ${start}`);
    }
    directory = parent;
  }
  return directory;
}

/** Every workspace package's manifest under `root`, in directory order. */
export function readWorkspace(root: string): Array<Manifest> {
  const workspace = workspaceRoot(root);
  const config: unknown = parse(
    readFileSync(join(workspace, 'pnpm-workspace.yaml'), 'utf8'),
  );
  const globs: unknown = isObject(config)
    ? Reflect.get(config, 'packages')
    : undefined;
  const tree = relative(workspace, resolve(root));
  return packageDirectories(globs, workspace, tree).map((directory) => {
    const file = `${directory}/package.json`;
    const json: unknown = JSON.parse(
      readFileSync(join(workspace, file), 'utf8'),
    );
    return manifestOf(json, file);
  });
}
