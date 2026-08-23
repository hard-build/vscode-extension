import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { formatTemporarySource } from "../src/core/formatting";

test("formatTemporarySource formats current text and removes its temporary file", async () => {
  let temporarySource = "";
  const formatted = await formatTemporarySource(
    "/work/example.CPP",
    "int   value;\n",
    async (file) => {
      temporarySource = file;
      assert.equal(path.basename(file), "example.CPP");
      assert.equal(await readFile(file, "utf8"), "int   value;\n");
      await writeFile(file, "int value;\n", "utf8");
    },
  );

  assert.equal(formatted, "int value;\n");
  assert.equal(existsSync(temporarySource), false);
});

test("formatTemporarySource removes its temporary file after a formatter error", async () => {
  let temporarySource = "";
  await assert.rejects(
    formatTemporarySource("/work/example.h++", "invalid", (file) => {
      temporarySource = file;
      return Promise.reject(new Error("formatter failed"));
    }),
    /formatter failed/u,
  );
  assert.equal(path.basename(temporarySource), "example.h++");
  assert.equal(existsSync(temporarySource), false);
});
