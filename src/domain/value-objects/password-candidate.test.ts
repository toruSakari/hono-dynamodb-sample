import assert from "node:assert/strict";
import { test } from "node:test";
import { PasswordCandidateSchema } from "./password-candidate.js";

void test("PasswordCandidate は新規パスワードの最小長と独立して照合候補を検証する", () => {
  assert.equal(PasswordCandidateSchema.parse("short"), "short");
  assert.throws(() => PasswordCandidateSchema.parse(""));
  assert.throws(() => PasswordCandidateSchema.parse("x".repeat(129)));
});
