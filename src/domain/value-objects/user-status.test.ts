import assert from "node:assert/strict";
import { test } from "node:test";
import { UserStatusSchema } from "./user-status.js";

void test("UserStatus は active / disabled のみ許可する", () => {
  assert.equal(UserStatusSchema.parse("active"), "active");
  assert.equal(UserStatusSchema.parse("disabled"), "disabled");
  assert.throws(() => UserStatusSchema.parse("deleted"));
});
