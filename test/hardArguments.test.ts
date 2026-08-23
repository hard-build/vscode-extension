import assert from "node:assert/strict";
import test from "node:test";

import { buildHardArguments } from "../src/core/hardArguments";

test("buildHardArguments renders build options without a shell", () => {
  assert.deepEqual(
    buildHardArguments({
      command: "build",
      paths: ["src/main.cpp"],
      jobs: 0,
      noCache: true,
      noColor: true,
      output: "out/",
      verbose: true,
    }),
    [
      "build",
      "--verbose",
      "--no-color",
      "--jobs=0",
      "--no-cache",
      "--output=out/",
      "src/main.cpp",
    ],
  );
});

test("buildHardArguments preserves hard test selectors", () => {
  assert.deepEqual(
    buildHardArguments({
      command: "test",
      paths: ["tests"],
      tests: ["Random.*", "Parser.Test?"],
      silent: true,
    }),
    [
      "test",
      "--silent",
      "--test=Random.*",
      "--test=Parser.Test?",
      "tests",
    ],
  );
});

test("buildHardArguments rejects invalid combinations", () => {
  assert.throws(
    () => buildHardArguments({ command: "test", listTests: true, tests: ["Suite.Case"] }),
    /mutually exclusive/u,
  );
  assert.throws(
    () => buildHardArguments({ command: "test", tests: ["Suite:Case"] }),
    /must not contain ':'/u,
  );
  assert.throws(
    () => buildHardArguments({ command: "fetch", noCache: true }),
    /only valid for build and test/u,
  );
});
