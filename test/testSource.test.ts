import assert from "node:assert/strict";
import test from "node:test";

import { parseGoogleTestSource } from "../src/core/testSource";

test("parseGoogleTestSource locates TEST and TEST_F bodies", () => {
  const source = [
    "TEST(math, adds)",
    "{",
    '  const char* closing = "}";',
    "  /* } does not close the test */",
    "  EXPECT_EQ(add(2, 3), 5);",
    "}",
    "",
    "TEST_F(",
    "  ParserFixture,",
    "  handles_value",
    ")",
    "{",
    "  EXPECT_TRUE(parse());",
    "}",
  ].join("\n");

  const locations = parseGoogleTestSource(source);
  assert.deepEqual(
    locations.map((location) => location.name),
    ["math.adds", "ParserFixture.handles_value"],
  );

  const first = locations[0];
  const second = locations[1];
  assert.ok(first !== undefined);
  assert.ok(second !== undefined);
  assert.ok(first.start <= source.indexOf("EXPECT_EQ"));
  assert.ok(first.end > source.indexOf("EXPECT_EQ"));
  assert.ok(first.end <= second.start);
  assert.equal(source.slice(first.start, first.end).endsWith("}"), true);
  assert.equal(source.slice(second.start, second.end).endsWith("}"), true);
});

test("parseGoogleTestSource ignores comments and string literals", () => {
  const source = [
    "// TEST(commented, out) {}",
    "/* TEST(block, out) {} */",
    'const char* ordinary = "TEST(string, out) {}";',
    'const char* raw = R"tag(TEST(raw_string, out) {})tag";',
    "TEST(real, works)",
    "{",
    "  EXPECT_TRUE(true);",
    "}",
  ].join("\n");

  assert.deepEqual(
    parseGoogleTestSource(source).map((location) => location.name),
    ["real.works"],
  );
});
