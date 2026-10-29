import assert from "node:assert/strict";
import { test } from "node:test";
import { EmailAddressSchema } from "./email-address.js";

void test("EmailAddress は外側の空白だけを除去し、メール形式と制御文字を検証する", () => {
  assert.equal(EmailAddressSchema.parse(" Demo@example.com "), "Demo@example.com");
  assert.throws(() => EmailAddressSchema.parse("not-an-address"));
  assert.throws(() => EmailAddressSchema.parse("a\nb@example.com"));
});
