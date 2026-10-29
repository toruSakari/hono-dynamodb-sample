import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryUserRepository } from "./memory-user-repository.js";
import { User } from "../../domain/entities/user.js";
import { UserNameSchema } from "../../domain/value-objects/user-name.js";
import { NewPasswordSchema } from "../../domain/value-objects/new-password.js";
import { passwordHasher } from "../../infrastructure/security/argon2-password-hasher.js";

void test("MemoryUserRepository.createは凍結Repositoryと独立した状態を組み立てる", async () => {
  const first = MemoryUserRepository.create();
  const second = MemoryUserRepository.create();
  assert(Object.isFrozen(MemoryUserRepository));
  assert(Object.isFrozen(first));
  assert.notEqual(first, second);
  const user = await User.create(
    UserNameSchema.parse("独立サンプル"),
    NewPasswordSchema.parse("demo-only-long-password"),
    passwordHasher,
  );
  await first.insert(user);
  assert(await first.findById(user.snapshot().id));
  assert.equal(await second.findById(user.snapshot().id), null);
});
