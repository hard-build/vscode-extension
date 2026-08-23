import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  hardEnvironment,
  hardRoot,
  isSourceFile,
  isTestSource,
  sourceForwardPath,
} from "../src/core/paths";

test("hard paths match backend defaults and source-forward layout", () => {
  assert.equal(hardRoot({}, "/home/developer"), path.join("/home/developer", ".local", "share", "hard"));
  assert.equal(hardRoot({ HARD_ROOT: "/tmp/hard" }), path.resolve("/tmp/hard"));
  assert.equal(hardEnvironment({}), "host");
  assert.equal(hardEnvironment({ HARD_ENV: "debug" }), "debug");

  const source = path.resolve("/work/project/example.cpp");
  assert.equal(
    sourceForwardPath("/tmp/hard", "host", source),
    path.join("/tmp/hard", "env", "host", "build", "work", "project", "example.cpp.fwd.h"),
  );
});

test("source classification follows hard extensions", () => {
  assert.equal(isSourceFile("example.CPP"), true);
  assert.equal(isSourceFile("example.hpp"), false);
  assert.equal(isTestSource("example_test.c++"), true);
  assert.equal(isTestSource("example.cpp"), false);
});
