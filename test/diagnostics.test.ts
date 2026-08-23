import assert from "node:assert/strict";
import test from "node:test";

import { parseCompilerDiagnostics } from "../src/core/diagnostics";

test("parseCompilerDiagnostics handles GCC, Clang, notes, and carriage-return progress", () => {
  const output =
    "[1/3] Compiling source.cpp\r" +
    "source.cpp:12:7: error: use of undeclared identifier 'value'\n" +
    "/tmp/header.h:4: warning: unused declaration\n" +
    "\u001b[33m/tmp/header.h:5:2: note: declared here\u001b[0m\n";

  assert.deepEqual(parseCompilerDiagnostics(output), [
    {
      file: "source.cpp",
      line: 11,
      column: 6,
      severity: "error",
      message: "use of undeclared identifier 'value'",
    },
    {
      file: "/tmp/header.h",
      line: 3,
      column: 0,
      severity: "warning",
      message: "unused declaration",
    },
    {
      file: "/tmp/header.h",
      line: 4,
      column: 1,
      severity: "information",
      message: "declared here",
    },
  ]);
});
