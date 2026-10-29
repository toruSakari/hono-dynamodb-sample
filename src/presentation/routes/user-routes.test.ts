import { MemoryOrderRepository } from "../../testing/repositories/memory-order-repository.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../testing/create-test-app.js";
import { passwordHasher } from "../../infrastructure/security/argon2-password-hasher.js";
import { MemoryUserRepository } from "../../testing/repositories/memory-user-repository.js";
import { ErrorSchema } from "../schemas/common-schemas.js";
import { PublicUserSchema } from "../schemas/user-schemas.js";
import { readJson, readPath, readObject } from "../testing/http-test-helpers.js";

const makeApp = (): ReturnType<typeof createTestApp> => {
  const users = MemoryUserRepository.create();
  return createTestApp({
    userRepository: users,
    orderRepository: MemoryOrderRepository.create(),
    passwordHasher,
  });
};
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

void test("ZodからOpenAPI 3.1を生成し、全API・公開DTO・入力専用パスワードを文書化する", async () => {
  const app = makeApp();
  const response = await app.request("/openapi.json");
  assert.equal(response.status, 200);
  const document = await readJson(response);
  assert.equal(readPath(document, "openapi"), "3.1.0");
  assert.deepEqual(Object.keys(readObject(readPath(document, "paths"))).sort(), [
    "/health",
    "/orders",
    "/orders/{id}",
    "/orders/{id}/confirm",
    "/orders/{id}/lines",
    "/orders/{id}/lines/{lineId}",
    "/users",
    "/users/{id}",
    "/users/{id}/email",
    "/users/{id}/name",
    "/users/{id}/password",
  ]);
  const schemas = readPath(document, "components", "schemas");
  assert.deepEqual(Object.keys(readObject(readPath(schemas, "PublicUser", "properties"))).sort(), [
    "email",
    "id",
    "name",
    "status",
    "version",
  ]);
  assert.equal(readPath(schemas, "PublicUser", "additionalProperties"), false);
  assert(
    JSON.stringify(readPath(schemas, "PublicUser", "properties", "email")).includes(
      '"type":"null"',
    ),
  );
  assert.equal(readPath(schemas, "CreateUser", "properties", "password", "writeOnly"), true);
  assert.equal(
    readPath(schemas, "ChangePassword", "properties", "currentPassword", "writeOnly"),
    true,
  );
  assert.equal(readPath(schemas, "ChangePassword", "properties", "newPassword", "writeOnly"), true);
  assert(!JSON.stringify(document).includes("passwordHash"));
  const operation = readPath(document, "paths", "/users/{id}/password", "patch");
  assert.deepEqual(Object.keys(readObject(readPath(operation, "responses"))).sort(), [
    "200",
    "400",
    "403",
    "404",
    "409",
    "413",
    "415",
    "500",
  ]);
  assert.equal(readPath(operation, "requestBody", "required"), true);
  assert.equal(
    readPath(operation, "responses", "200", "headers", "X-Request-ID", "schema", "format"),
    "uuid",
  );
  assert.equal(readPath(document, "components", "securitySchemes"), undefined);
  const docs = await app.request("/docs");
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /\/openapi\.json/);
});

void test("成功・未存在・入力失敗・形式違反の実応答が公開Zod契約に適合する", async () => {
  const app = makeApp();
  const created = await app.request(
    "/users",
    json({ name: "仕様サンプル", password: "demo-only-long-password" }),
  );
  assert.equal(created.status, 201);
  const user = PublicUserSchema.parse(await readJson(created));
  assert.equal(user.email, null);
  const fetched = await app.request("/users/" + user.id);
  assert.equal(fetched.status, 200);
  assert.deepEqual(PublicUserSchema.parse(await readJson(fetched)), user);
  const failures = [
    [await app.request("/users", json({ name: "", password: "short" })), 400],
    [await app.request("/users", { ...json({}), body: "{" }), 400],
    [await app.request("/users", { method: "POST", body: "{}" }), 415],
    [await app.request("/users/00000000-0000-4000-8000-000000000000"), 404],
    [await app.request("/users", json({ name: "x".repeat(5000) })), 413],
  ] as const;
  for (const entry of failures) {
    const response = entry[0];
    const status = entry[1];
    assert.equal(response.status, status);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    ErrorSchema.parse(await readJson(response));
  }
});
