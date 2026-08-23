import assert from "node:assert/strict";
import test from "node:test";

import { parseShellWords } from "../src/core/shellWords";

test("parseShellWords handles quoting, escaping, and empty values", () => {
  assert.deepEqual(
    parseShellWords("-Ione '-Itwo words' \"-DNAME=two words\" empty\\ value ''"),
    ["-Ione", "-Itwo words", "-DNAME=two words", "empty value", ""],
  );
});

test("parseShellWords rejects unfinished syntax", () => {
  assert.throws(() => parseShellWords("'unfinished"), /unclosed quote/u);
  assert.throws(() => parseShellWords("unfinished\\"), /unfinished escape/u);
});
