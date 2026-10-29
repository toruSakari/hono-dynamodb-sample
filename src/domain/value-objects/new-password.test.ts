import assert from "node:assert/strict";
import { test } from "node:test";
import { NewPasswordSchema } from "./new-password.js";

void test("NewPassword は長さを検証し、trimや正規化をしない", () => {
  assert.throws(() => NewPasswordSchema.parse("short"));
  assert.throws(() => NewPasswordSchema.parse("x".repeat(129)));
  assert.equal(NewPasswordSchema.parse(" demo-only-password "), " demo-only-password ");
});
