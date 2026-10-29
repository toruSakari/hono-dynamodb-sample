import assert from "node:assert/strict";
import { test } from "node:test";
import { AggregateVersionSchema } from "./aggregate-version.js";

void test("AggregateVersion は既存の非負整数と安全な上限を維持する", () => {
  for (const value of [0, 1, Number.MAX_SAFE_INTEGER - 1]) {
    assert.equal(AggregateVersionSchema.parse(value), value);
  }
});

void test("AggregateVersion は範囲外・小数・非数値を拒否する", () => {
  for (const value of [
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    "0",
    null,
    undefined,
  ]) {
    assert.throws(() => AggregateVersionSchema.parse(value));
  }
});
