import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { cachedLibraryIncludePaths } from "../src/core/parseCache";
import { sourceBuildPath } from "../src/core/paths";

test("cachedLibraryIncludePaths uses the package selected by the source parse cache", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "hard-vscode-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));

  const root = path.join(temporary, "hard");
  const workspace = path.join(temporary, "workspace");
  const source = path.join(workspace, "example.cpp");
  const recipe = path.join(workspace, "yaml_cpp.hard.h");
  const selectedInclude = path.join(
    root,
    "env",
    "host",
    "library",
    "github.com",
    "jbeder",
    "yaml-cpp",
    "selected",
    "install",
    "include",
  );
  const selectedHeader = path.join(selectedInclude, "yaml-cpp", "yaml.h");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(recipe, "#pragma once\n#include <yaml-cpp/yaml.h>\n");

  const cacheFile = `${sourceBuildPath(root, "host", source)}.hard-parse-cache.json`;
  mkdirSync(path.dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify({
    dependencies: [recipe, selectedHeader],
    managed_dependencies: [selectedHeader],
    library_headers: [recipe],
  }));

  const unrelatedSource = path.join(workspace, "other.cpp");
  const unrelatedRecipe = path.join(workspace, "other.hard.h");
  const unrelatedInclude = path.join(
    root,
    "env",
    "host",
    "library",
    "github.com",
    "example",
    "other",
    "stale",
    "install",
    "public",
  );
  const unrelatedHeader = path.join(unrelatedInclude, "other", "api.h");
  writeFileSync(unrelatedRecipe, "#pragma once\n#include <other/api.h>\n");
  const unrelatedCache = `${sourceBuildPath(root, "host", unrelatedSource)}.hard-parse-cache.json`;
  writeFileSync(unrelatedCache, JSON.stringify({
    dependencies: [unrelatedRecipe, unrelatedHeader],
    managed_dependencies: [unrelatedHeader],
    library_headers: [unrelatedRecipe],
  }));

  assert.deepEqual(
    cachedLibraryIncludePaths(root, "host", workspace, source),
    [selectedInclude],
  );
  assert.deepEqual(
    cachedLibraryIncludePaths(root, "host", workspace, recipe),
    [selectedInclude],
  );
  assert.deepEqual(
    cachedLibraryIncludePaths(root, "host", workspace),
    [unrelatedInclude, selectedInclude].sort(),
  );
});

test("cachedLibraryIncludePaths ignores missing and invalid parse caches", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "hard-vscode-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));

  assert.deepEqual(
    cachedLibraryIncludePaths(
      path.join(temporary, "hard"),
      "host",
      path.join(temporary, "missing-workspace"),
    ),
    [],
  );

  const workspace = path.join(temporary, "workspace");
  const cacheFile = `${sourceBuildPath(
    path.join(temporary, "hard"),
    "host",
    path.join(workspace, "example.cpp"),
  )}.hard-parse-cache.json`;
  mkdirSync(path.dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, "not json");
  assert.deepEqual(
    cachedLibraryIncludePaths(path.join(temporary, "hard"), "host", workspace),
    [],
  );
});
