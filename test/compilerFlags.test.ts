import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { analyzeCompilerFlags } from "../src/core/compilerFlags";

test("analyzeCompilerFlags extracts hard IntelliSense inputs", () => {
  assert.deepEqual(
    analyzeCompilerFlags(
      [
        "-Iinclude",
        "-isystem",
        "/opt/sdk",
        "-iquotegenerated",
        "-include",
        "hard.h",
        "-DNAME=value",
        "-D",
        "SECOND",
        "-std=c++23",
      ],
      "/work/project",
    ),
    {
      includePaths: [
        path.resolve("/work/project/include"),
        "/opt/sdk",
        path.resolve("/work/project/generated"),
      ],
      forcedIncludes: [path.resolve("/work/project/hard.h")],
      defines: ["NAME=value", "SECOND"],
      standard: "c++23",
    },
  );
});
