import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

interface Manifest {
  version?: unknown;
  contributes?: {
    configuration?: {
      properties?: Record<string, { default?: unknown }>;
    };
    configurationDefaults?: Record<string, unknown>;
    menus?: Record<string, Array<{ command?: unknown; when?: unknown }>>;
  };
  scripts?: Record<string, unknown>;
}

interface Lockfile {
  version?: unknown;
  packages?: Record<string, { version?: unknown }>;
}

const project = path.resolve(__dirname, "..", "..");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(project, file), "utf8")) as T;
}

test("manifest selects hard as the default C/C++ provider and formatter", () => {
  const manifest = readJson<Manifest>("package.json");
  const defaults = manifest.contributes?.configurationDefaults;
  assert.equal(
    defaults?.["C_Cpp.default.configurationProvider"],
    "hard-build.hard-vscode",
  );
  const formatter = { "editor.defaultFormatter": "hard-build.hard-vscode" };
  assert.deepEqual(defaults?.["[c]"], formatter);
  assert.deepEqual(defaults?.["[cpp]"], formatter);
});

test("manifest discovers preferred and legacy hard test sources", () => {
  const manifest = readJson<Manifest>("package.json");
  assert.equal(
    manifest.contributes?.configuration?.properties?.["hard.testSourcePattern"]?.default,
    "**/*{.[tT][eE][sS][tT],_[tT][eE][sS][tT]}.{[cC],[cC][cC],[cC][pP][pP],[cC]++}",
  );
  const testFileMenu = manifest.contributes?.menus?.["editor/title"]?.find(
    (entry) => entry.command === "hard.testFile",
  );
  assert.equal(
    testFileMenu?.when,
    "resourceFilename =~ /(?:\\.test|_test)\\.(c|cc|cpp|c\\+\\+)$/i",
  );
});

test("manifest, lockfile, and VSIX output use one version", () => {
  const manifest = readJson<Manifest>("package.json");
  const lockfile = readJson<Lockfile>("package-lock.json");
  assert.equal(lockfile.version, manifest.version);
  assert.equal(lockfile.packages?.[""]?.version, manifest.version);
  assert.equal(
    manifest.scripts?.package,
    `npm run check && vsce package --out hard-vscode-${String(manifest.version)}.vsix`,
  );
});

test("manifest places hard build in the Run or Debug menu", () => {
  const manifest = readJson<Manifest>("package.json");
  const buildMenu = manifest.contributes?.menus?.["editor/title/run"]?.find(
    (entry) => entry.command === "hard.build",
  );

  assert.equal(
    buildMenu?.when,
    "resourceLangId == c || resourceLangId == cpp",
  );
  assert.equal(
    manifest.contributes?.menus?.["editor/title"]?.some(
      (entry) => entry.command === "hard.build",
    ),
    false,
  );
});
