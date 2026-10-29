import assert from "node:assert/strict";
import { test } from "node:test";
import { Password } from "./password.js";
import { PasswordCandidateSchema, NewPasswordSchema } from "./index.js";
import { passwordHasher } from "../../infrastructure/security/argon2-password-hasher.js";

void test("Password はハッシュだけを非公開に保持し、生成・復元・照合を担当する", async () => {
  const input = NewPasswordSchema.parse("demo-only-long-password");
  const password = await Password.create(input, passwordHasher);
  assert(Object.isFrozen(Password));
  assert(Object.isFrozen(password));
  // 故意にブランド/インスタンス型を偽装し、実行時検証が迂回できないことを確認する。
  assert.throws(() => Password.toPersistenceSnapshot({} as Password));
  assert.equal(JSON.stringify(password), "{}");
  assert.equal("hash" in password, false);
  assert.equal("plaintext" in password, false);
  const stored = Password.toPersistenceSnapshot(password);
  const restored = Password.restore(stored);
  assert.equal(Password.toPersistenceSnapshot(restored), stored);
  assert(await restored.matches(PasswordCandidateSchema.parse(input), passwordHasher));
  assert.equal(
    await restored.matches(PasswordCandidateSchema.parse("wrong"), passwordHasher),
    false,
  );
  assert.throws(() => Password.restore("plaintext"));
});
