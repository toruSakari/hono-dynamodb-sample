import assert from "node:assert/strict";
import { test } from "node:test";
import type { User } from "../../domain/entities/user.js";
import { UserService } from "./user-service.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import { MemoryUserRepository } from "../../testing/repositories/memory-user-repository.js";
import { passwordHasher } from "../../infrastructure/security/argon2-password-hasher.js";
import { UserNameSchema } from "../../domain/value-objects/user-name.js";
import { NewPasswordSchema } from "../../domain/value-objects/new-password.js";
import { EmailAddressSchema } from "../../domain/value-objects/email-address.js";
import { PasswordCandidateSchema } from "../../domain/value-objects/password-candidate.js";
import { UserIdSchema } from "../../domain/value-objects/user-id.js";
import { ConflictError } from "../../domain/errors/conflict-error.js";

void test("直接UserServiceは渡されたRepositoryだけを使い、操作ごとに保存versionを進める", async () => {
  assert(Object.isFrozen(UserService));
  const users = MemoryUserRepository.create();
  const otherUsers = MemoryUserRepository.create();
  const created = await UserService.register(
    users,
    passwordHasher,
    UserNameSchema.parse("サンプル"),
    NewPasswordSchema.parse("demo-only-long-password"),
  );
  assert.equal(await UserService.find(otherUsers, created.id), null);
  assert.equal(
    (await UserService.rename(users, created.id, UserNameSchema.parse("変更後")))?.version,
    1,
  );
  assert.equal(
    (
      await UserService.changeEmail(
        users,
        created.id,
        EmailAddressSchema.parse("demo@example.test"),
      )
    )?.version,
    2,
  );
  assert.equal(
    (
      await UserService.changePassword(
        users,
        passwordHasher,
        created.id,
        PasswordCandidateSchema.parse("demo-only-long-password"),
        NewPasswordSchema.parse("another-demo-long-password"),
      )
    )?.version,
    3,
  );
  assert.equal((await UserService.disable(users, created.id))?.status, "disabled");
  assert.equal((await UserService.reactivate(users, created.id))?.version, 5);
  const saved = await users.findById(created.id);
  assert(saved);
  assert(
    await saved.verifyPassword(
      PasswordCandidateSchema.parse("another-demo-long-password"),
      passwordHasher,
    ),
  );
});

void test("各User操作は未存在なら保存せずnullを返す", async () => {
  const users: UserRepository = {
    async findById(): Promise<User | null> {
      return null;
    },
    async insert(): Promise<void> {
      assert.fail("insertは呼ばれない");
    },
    async update(): Promise<void> {
      assert.fail("updateは呼ばれない");
    },
  };
  const id = UserIdSchema.parse("00000000-0000-4000-8000-000000000000");
  assert.equal(await UserService.rename(users, id, UserNameSchema.parse("名前")), null);
  assert.equal(
    await UserService.changeEmail(users, id, EmailAddressSchema.parse("demo@example.test")),
    null,
  );
  assert.equal(
    await UserService.changePassword(
      users,
      passwordHasher,
      id,
      PasswordCandidateSchema.parse("dummy"),
      NewPasswordSchema.parse("demo-only-long-password"),
    ),
    null,
  );
  assert.equal(await UserService.disable(users, id), null);
  assert.equal(await UserService.reactivate(users, id), null);
});

void test("Userの保存競合は自動再試行せず呼び出し側へ返す", async () => {
  const users = MemoryUserRepository.create();
  const created = await UserService.register(
    users,
    passwordHasher,
    UserNameSchema.parse("競合サンプル"),
    NewPasswordSchema.parse("demo-only-long-password"),
  );
  let attempts = 0;
  const repository: UserRepository = {
    ...users,
    async update(_user: User, expectedVersion: number): Promise<void> {
      attempts += 1;
      assert.equal(expectedVersion, 0);
      throw new ConflictError("競合しました");
    },
  };
  await assert.rejects(
    UserService.rename(repository, created.id, UserNameSchema.parse("変更")),
    ConflictError,
  );
  assert.equal(attempts, 1);
  assert.equal((await UserService.find(users, created.id))?.version, 0);
});
