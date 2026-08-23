import assert from "node:assert/strict";
import test from "node:test";

import { HardProcessRunner } from "../src/hardProcess";

test("HardProcessRunner captures stdout, stderr, and exit status without a shell", async () => {
  let streamed = "";
  const result = await new HardProcessRunner().run(
    {
      executable: process.execPath,
      arguments: [
        "-e",
        "process.stdout.write('stdout'); process.stderr.write('stderr'); process.exitCode = 3;",
      ],
      cwd: process.cwd(),
      environment: process.env,
    },
    (chunk) => {
      streamed += chunk;
    },
  );

  assert.equal(result.code, 3);
  assert.equal(result.error, undefined);
  assert.match(result.output, /stdout/u);
  assert.match(result.output, /stderr/u);
  assert.equal(streamed, result.output);
});

test("HardProcessRunner turns a missing executable into status 127", async () => {
  const result = await new HardProcessRunner().run(
    {
      executable: "/path/that/does/not/exist/hard",
      arguments: ["build"],
      cwd: process.cwd(),
      environment: process.env,
    },
    () => {},
  );

  assert.equal(result.code, 127);
  assert.ok(result.error instanceof Error);
  assert.match(result.output, /cannot start/u);
});
