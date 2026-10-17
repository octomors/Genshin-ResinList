import test from "node:test";
import assert from "node:assert/strict";
import { bestMatch, isTalentsWord, sortDays } from "../matching.js";

const catalog = [
  { name: "Raiden Shogun", kind: "character" },
  { name: "Skyward Harp", kind: "weapon" }
];

test("matches names and small typos", () => {
  assert.equal(bestMatch("raiden", catalog), catalog[0]);
  assert.equal(bestMatch("skyharp", catalog), catalog[1]);
  assert.equal(bestMatch("unknown", catalog), null);
});

test("recognizes talent shorthand", () => {
  assert.equal(isTalentsWord("tal"), true);
  assert.equal(isTalentsWord("talents"), true);
  assert.equal(isTalentsWord("level"), false);
});

test("sorts material days chronologically", () => {
  assert.deepEqual(sortDays(["sunday", "monday", "friday"]), ["monday", "friday", "sunday"]);
});
