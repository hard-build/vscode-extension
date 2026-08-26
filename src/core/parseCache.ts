import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { sourceBuildPath } from "./paths";

interface SourceParseCache {
  dependencies?: unknown;
  managed_dependencies?: unknown;
  library_headers?: unknown;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseCacheFiles(directory: string): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...parseCacheFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".hard-parse-cache.json")) {
      files.push(entryPath);
    }
  }
  return files;
}

function readParseCache(file: string): SourceParseCache | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof value === "object" && value !== null
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function includesFromHeader(file: string): string[] {
  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return [];
  }

  const includes = new Set<string>();
  const pattern = /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gmu;
  for (const match of contents.matchAll(pattern)) {
    const include = match[1];
    if (include !== undefined && include !== "") {
      includes.add(include);
    }
  }
  return [...includes];
}

function isWithin(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function includeRoot(dependency: string, include: string): string | undefined {
  if (path.isAbsolute(include)) {
    return undefined;
  }
  const normalizedInclude = path.normalize(include);
  if (
    normalizedInclude === ".." ||
    normalizedInclude.startsWith(`..${path.sep}`)
  ) {
    return undefined;
  }
  const normalizedDependency = path.normalize(dependency);
  const suffix = `${path.sep}${normalizedInclude}`;
  return normalizedDependency.endsWith(suffix)
    ? normalizedDependency.slice(0, -suffix.length)
    : undefined;
}

function cacheAppliesToFile(
  cacheFile: string,
  cache: SourceParseCache,
  root: string,
  environment: string,
  file: string,
): boolean {
  const normalizedFile = path.normalize(file);
  if (cacheFile === `${sourceBuildPath(root, environment, normalizedFile)}.hard-parse-cache.json`) {
    return true;
  }
  return [
    ...stringArray(cache.dependencies),
    ...stringArray(cache.library_headers),
  ].some((dependency) => path.normalize(dependency) === normalizedFile);
}

export function cachedLibraryIncludePaths(
  root: string,
  environment: string,
  workspace: string,
  file?: string,
): string[] {
  const buildDirectory = sourceBuildPath(root, environment, workspace);
  const libraryDirectory = path.join(root, "env", environment, "library");
  const includeCache = new Map<string, string[]>();
  const includePaths = new Set<string>();

  for (const cacheFile of parseCacheFiles(buildDirectory)) {
    const cache = readParseCache(cacheFile);
    if (
      cache === undefined ||
      (file !== undefined && !cacheAppliesToFile(cacheFile, cache, root, environment, file))
    ) {
      continue;
    }

    const dependencies = stringArray(cache.managed_dependencies)
      .map((dependency) => path.normalize(dependency))
      .filter((dependency) => isWithin(libraryDirectory, dependency));
    for (const header of stringArray(cache.library_headers)) {
      let includes = includeCache.get(header);
      if (includes === undefined) {
        includes = includesFromHeader(header);
        includeCache.set(header, includes);
      }
      for (const include of includes) {
        for (const dependency of dependencies) {
          const rootPath = includeRoot(dependency, include);
          if (rootPath !== undefined) {
            includePaths.add(rootPath);
          }
        }
      }
    }
  }

  return [...includePaths].sort();
}
