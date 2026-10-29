import { UserNameSchema } from "../domain/value-objects/user-name.js";
import { NewPasswordSchema } from "../domain/value-objects/new-password.js";
import type { PublicUser } from "../domain/entities/user.js";
import { PublicUserSchema } from "./schemas/user-schemas.js";
import { ErrorSchema } from "./schemas/common-schemas.js";
import { readJson } from "./testing/http-test-helpers.js";
import { MemoryOrderRepository } from "../testing/repositories/memory-order-repository.js";
import type { UserRepository } from "../domain/repositories/user-repository.js";
import { UserIdSchema, PasswordCandidateSchema } from "../domain/value-objects/index.js";
import { UserService } from "../application/use-cases/user-service.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "./testing/create-test-app.js";
import { passwordHasher } from "../infrastructure/security/argon2-password-hasher.js";
import { MemoryUserRepository } from "../testing/repositories/memory-user-repository.js";
import { ConflictError } from "../domain/errors/conflict-error.js";

function makeApp(
  repository: UserRepository = MemoryUserRepository.create(),
): ReturnType<typeof createTestApp> {
  return createTestApp({
    userRepository: repository,
    orderRepository: MemoryOrderRepository.create(),
    passwordHasher,
  });
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
void test("HTTP 登録・取得・改名は公開スナップショットのみ返す", async () => {
  const app = makeApp();
  const created = await app.request(
    "/users",
    json({ name: "サンプル", password: "demo-only-long-password" }),
  );
  assert.equal(created.status, 201);
  const user = PublicUserSchema.parse(await readJson(created));
  assert.deepEqual(Object.keys(user).sort(), ["email", "id", "name", "status", "version"]);
  const fetched = await app.request("/users/" + user.id);
  assert.deepEqual(PublicUserSchema.parse(await readJson(fetched)), user);
  const renamed = await app.request("/users/" + user.id + "/name", {
    ...json({ name: "新しい名前" }),
    method: "PATCH",
  });
  assert.equal(renamed.status, 200);
  assert.deepEqual(PublicUserSchema.parse(await readJson(renamed)), {
    ...user,
    name: "新しい名前",
    version: 1,
  });
});
void test("不正入力・不正JSON・未存在・巨大入力を区別する", async () => {
  const app = makeApp();
  assert.equal((await app.request("/users", json({ name: "", password: "short" }))).status, 400);
  assert.equal((await app.request("/users", { ...json({}), body: "{" })).status, 400);
  assert.equal((await app.request("/users/not-uuid")).status, 400);
  assert.equal((await app.request("/users/00000000-0000-4000-8000-000000000000")).status, 404);
  assert.equal((await app.request("/users", json({ name: "x".repeat(5000) }))).status, 413);
});
void test("内部エラーの詳細を漏らさず、競合は409を返す", async () => {
  const repository = MemoryUserRepository.create();
  const app = makeApp({
    ...repository,
    async findById(): Promise<never> {
      throw new Error("secret-data");
    },
    async insert(): Promise<never> {
      throw new ConflictError("secret-data");
    },
  });
  const failure = await app.request("/users/00000000-0000-4000-8000-000000000000");
  assert.equal(failure.status, 500);
  assert(!(await failure.text()).includes("secret-data"));
  const conflict = await app.request(
    "/users",
    json({ name: "例", password: "demo-only-long-password" }),
  );
  assert.equal(conflict.status, 409);
});

void test("メールとパスワードを変更でき、誤った現在パスワードや不正入力は保存しない", async () => {
  const repository = MemoryUserRepository.create();
  const app = makeApp(repository);
  const response = await app.request(
    "/users",
    json({ name: "例", email: "demo@example.com", password: "demo-only-long-password" }),
  );
  const user = PublicUserSchema.parse(await readJson(response));
  assert.equal(response.status, 201);
  const email = await app.request("/users/" + user.id + "/email", {
    ...json({ email: "changed@example.com" }),
    method: "PATCH",
  });
  assert.equal(email.status, 200);
  assert.equal(PublicUserSchema.parse(await readJson(email)).email, "changed@example.com");
  const rejected = await app.request("/users/" + user.id + "/password", {
    ...json({ currentPassword: "wrong", newPassword: "different-demo-password" }),
    method: "PATCH",
  });
  assert.equal(rejected.status, 403);
  assert.equal(
    PublicUserSchema.parse(await readJson(await app.request("/users/" + user.id))).version,
    1,
  );
  const accepted = await app.request("/users/" + user.id + "/password", {
    ...json({ currentPassword: "demo-only-long-password", newPassword: "different-demo-password" }),
    method: "PATCH",
  });
  assert.equal(accepted.status, 200);
  const publicUser = PublicUserSchema.parse(await readJson(accepted));
  assert.equal(publicUser.version, 2);
  assert.deepEqual(Object.keys(publicUser).sort(), ["email", "id", "name", "status", "version"]);
  const stored = await repository.findById(UserIdSchema.parse(user.id));
  assert(stored);
  assert(
    await stored.verifyPassword(
      PasswordCandidateSchema.parse("different-demo-password"),
      passwordHasher,
    ),
  );
  assert.equal(
    await stored.verifyPassword(
      PasswordCandidateSchema.parse("demo-only-long-password"),
      passwordHasher,
    ),
    false,
  );
  const invalidEmail = await app.request("/users/" + user.id + "/email", {
    ...json({ email: "invalid" }),
    method: "PATCH",
  });
  assert.equal(invalidEmail.status, 400);
});

void test("無効 User の HTTP 変更は409、管理者向け状態操作はHTTP非公開", async () => {
  const repository = MemoryUserRepository.create();
  const app = makeApp(repository);
  const response = await app.request(
    "/users",
    json({ name: "例", password: "demo-only-long-password" }),
  );
  const user = PublicUserSchema.parse(await readJson(response));
  const stored = await repository.findById(UserIdSchema.parse(user.id));
  assert(stored);
  await repository.update(stored.disable(), 0);
  const response2 = await app.request("/users/" + user.id + "/name", {
    ...json({ name: "変更" }),
    method: "PATCH",
  });
  assert.equal(response2.status, 409);
  assert.equal(
    (await app.request("/users/" + user.id + "/reactivate", { method: "POST" })).status,
    404,
  );
});

void test("不正なユースケースDTOの余分なpasswordHashを公開せず500へ変換する", async () => {
  const users = MemoryUserRepository.create();
  const customer = await UserService.register(
    users,
    passwordHasher,
    UserNameSchema.parse("境界サンプル"),
    NewPasswordSchema.parse("demo-only-long-password"),
  );
  const maliciousService = {
    ...UserService,
    async find(): Promise<PublicUser & { passwordHash: string }> {
      return { ...customer, passwordHash: "must-not-leak" };
    },
  };
  const app = createTestApp(
    { userRepository: users, orderRepository: MemoryOrderRepository.create(), passwordHasher },
    { userService: maliciousService },
  );
  const response = await app.request("/users/" + customer.id);
  assert.equal(response.status, 500);
  assert.deepEqual(ErrorSchema.parse(await readJson(response)), { error: "内部エラーです" });
});
