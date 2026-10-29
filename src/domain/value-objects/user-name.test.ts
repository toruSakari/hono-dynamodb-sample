import assert from "node:assert/strict";
import { test } from "node:test";
import { UserNameSchema } from "./user-name.js";

void test("UserName はtrim後の空文字・制御文字・上限超過を拒否する", () => {
  assert.equal(UserNameSchema.parse(" 名前 "), "名前");
  assert.throws(() => UserNameSchema.parse(" "));
  assert.throws(() => UserNameSchema.parse("a\nb"));
  assert.throws(() => UserNameSchema.parse("x".repeat(51)));
});
