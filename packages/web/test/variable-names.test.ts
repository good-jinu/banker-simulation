import assert from "node:assert/strict";
import { test } from "node:test";
import { isVariableName } from "../src/market/market-recipe.ts";

test("player variable names accept identifier-safe custom names", () => {
  assert.equal(isVariableName("interest_rate"), true);
  assert.equal(isVariableName("rate2026"), true);
  assert.equal(isVariableName("_buffer"), true);
});

test("player variable names reject empty and unsafe names", () => {
  assert.equal(isVariableName(""), false);
  assert.equal(isVariableName("2rate"), false);
  assert.equal(isVariableName("interest-rate"), false);
  assert.equal(isVariableName("이자율"), false);
});
