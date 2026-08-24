import assert from "node:assert/strict";
import test from "node:test";

import {
  isCachedTestRun,
  parseGoogleTestResults,
  parseHardTestList,
} from "../src/core/testProtocol";

test("parseHardTestList accepts normalized single and grouped output", () => {
  assert.deepEqual(
    parseHardTestList(
      "first.test.cpp:\n  Suite.First\n\nsecond.test.cpp:\n  Typed/Suite.HandlesValue\n",
    ),
    ["Suite.First", "Typed/Suite.HandlesValue"],
  );
});

test("parseGoogleTestResults reports passed, failed, and skipped cases", () => {
  const output = [
    "[ RUN      ] Suite.Passes",
    "[       OK ] Suite.Passes (2 ms)",
    "[ RUN      ] Suite.Fails",
    "failure detail",
    "[  FAILED  ] Suite.Fails (3 ms)",
    "[ RUN      ] Suite.Skips",
    "[  SKIPPED ] Suite.Skips (0 ms)",
  ].join("\n");

  assert.deepEqual(parseGoogleTestResults(output), [
    {
      name: "Suite.Passes",
      status: "passed",
      duration: 2,
      message: "[ RUN      ] Suite.Passes\n[       OK ] Suite.Passes (2 ms)",
    },
    {
      name: "Suite.Fails",
      status: "failed",
      duration: 3,
      message: "[ RUN      ] Suite.Fails\nfailure detail\n[  FAILED  ] Suite.Fails (3 ms)",
    },
    {
      name: "Suite.Skips",
      status: "skipped",
      duration: 0,
      message: "[ RUN      ] Suite.Skips\n[  SKIPPED ] Suite.Skips (0 ms)",
    },
  ]);
});

test("isCachedTestRun recognizes hard cache output", () => {
  assert.equal(isCachedTestRun("[6/6] Testing calculator.test (CACHED)\n"), true);
  assert.equal(isCachedTestRun("[6/6] Testing calculator.test\n"), false);
});
