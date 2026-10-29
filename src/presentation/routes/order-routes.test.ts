import type { UserRepository } from "../../domain/repositories/user-repository.js";
import type { OrderRepository } from "../../domain/repositories/order-repository.js";
import { PublicUserSchema } from "../schemas/user-schemas.js";
import { readJson, readPath } from "../testing/http-test-helpers.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../testing/create-test-app.js";
import { MemoryUserRepository } from "../../testing/repositories/memory-user-repository.js";
import { MemoryOrderRepository } from "../../testing/repositories/memory-order-repository.js";
import { passwordHasher } from "../../infrastructure/security/argon2-password-hasher.js";
import { UserIdSchema } from "../../domain/value-objects/user-id.js";
import { ConflictError } from "../../domain/errors/conflict-error.js";
import { PublicOrderSchema } from "../schemas/order-schemas.js";
import { ErrorSchema } from "../schemas/common-schemas.js";

const request = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
function setup(): {
  users: UserRepository;
  orders: OrderRepository;
  app: ReturnType<typeof createTestApp>;
} {
  const users = MemoryUserRepository.create();
  const orders = MemoryOrderRepository.create();
  return {
    users,
    orders,
    app: createTestApp({ userRepository: users, orderRepository: orders, passwordHasher }),
  };
}

void test("Order APIは顧客確認・明細追加/数量変更/削除・合計計算・確定を集約経由で行う", async () => {
  const fixture = setup();
  const app = fixture.app;
  const customerResponse = await app.request(
    "/users",
    request({ name: "注文サンプル", password: "demo-only-long-password" }),
  );
  assert.equal(customerResponse.status, 201);
  const customer = PublicUserSchema.parse(await readJson(customerResponse));
  const created = await app.request("/orders", request({ customerId: customer.id }));
  assert.equal(created.status, 201);
  const draft = PublicOrderSchema.parse(await readJson(created));
  assert.equal(draft.totalYen, 0);
  assert.equal(draft.version, 0);
  assert.deepEqual(draft.lines, []);
  const emptyConfirm = await app.request("/orders/" + draft.id + "/confirm", { method: "POST" });
  assert.equal(emptyConfirm.status, 409);
  const first = await app.request(
    "/orders/" + draft.id + "/lines",
    request({ productCode: "BOOK-1", unitPriceYen: 1200, quantity: 2 }),
  );
  assert.equal(first.status, 200);
  const withFirst = PublicOrderSchema.parse(await readJson(first));
  assert.equal(withFirst.totalYen, 2400);
  const firstLine = withFirst.lines[0];
  assert(firstLine);
  const second = await app.request(
    "/orders/" + draft.id + "/lines",
    request({ productCode: "PEN_2", unitPriceYen: 100, quantity: 3 }),
  );
  const withSecond = PublicOrderSchema.parse(await readJson(second));
  assert.equal(withSecond.totalYen, 2700);
  const secondLine = withSecond.lines[1];
  assert(secondLine);
  const changed = await app.request(
    "/orders/" + draft.id + "/lines/" + firstLine.id,
    request({ quantity: 1 }, "PATCH"),
  );
  const withQuantity = PublicOrderSchema.parse(await readJson(changed));
  assert.equal(withQuantity.totalYen, 1500);
  const removed = await app.request("/orders/" + draft.id + "/lines/" + secondLine.id, {
    method: "DELETE",
  });
  assert.equal(removed.status, 200);
  const withRemoved = PublicOrderSchema.parse(await readJson(removed));
  assert.equal(withRemoved.lines.length, 1);
  assert.equal(withRemoved.totalYen, 1200);
  const confirmed = await app.request("/orders/" + draft.id + "/confirm", { method: "POST" });
  assert.equal(confirmed.status, 200);
  const final = PublicOrderSchema.parse(await readJson(confirmed));
  assert.equal(final.status, "confirmed");
  assert.equal(final.version, 5);
  const fetched = await app.request("/orders/" + draft.id);
  assert.deepEqual(PublicOrderSchema.parse(await readJson(fetched)), final);
  assert.deepEqual(draft.lines, []);
  assert.equal(withFirst.totalYen, 2400);
  const forbidden = await app.request(
    "/orders/" + draft.id + "/lines/" + firstLine.id,
    request({ quantity: 2 }, "PATCH"),
  );
  assert.equal(forbidden.status, 409);
  assert.equal(
    PublicOrderSchema.parse(await readJson(await app.request("/orders/" + draft.id))).version,
    5,
  );
});

void test("Order APIは不正入力・顧客未存在/無効・明細重複・不明明細・ルート未存在を区別する", async () => {
  const fixture = setup();
  const app = fixture.app;
  const id = "00000000-0000-4000-8000-000000000000";
  assert.equal((await app.request("/orders", request({ customerId: id }))).status, 404);
  assert.equal((await app.request("/orders/" + id)).status, 404);
  assert.equal((await app.request("/orders", request({ customerId: "bad" }))).status, 400);
  assert.equal((await app.request("/orders", { method: "POST", body: "{}" })).status, 415);
  const customer = PublicUserSchema.parse(
    await readJson(
      await app.request("/users", request({ name: "顧客", password: "demo-only-long-password" })),
    ),
  );
  const draft = PublicOrderSchema.parse(
    await readJson(await app.request("/orders", request({ customerId: customer.id }))),
  );
  const path = "/orders/" + draft.id + "/lines";
  assert.equal(
    (await app.request(path, request({ productCode: "BOOK", unitPriceYen: 100, quantity: 1 })))
      .status,
    200,
  );
  assert.equal(
    (await app.request(path, request({ productCode: "BOOK", unitPriceYen: 100, quantity: 1 })))
      .status,
    409,
  );
  const badInputs = [
    { productCode: "lowercase", unitPriceYen: 100, quantity: 1 },
    { productCode: "BOOK2", unitPriceYen: -1, quantity: 1 },
    { productCode: "BOOK2", unitPriceYen: 1.5, quantity: 1 },
    { productCode: "BOOK2", unitPriceYen: 100, quantity: 0 },
    { productCode: "BOOK2", unitPriceYen: 100, quantity: 100 },
    { productCode: "BOOK2", unitPriceYen: 100, quantity: 1, lineTotalYen: 1 },
  ];
  for (const input of badInputs) {
    const response = await app.request(path, request(input));
    assert.equal(response.status, 400);
    ErrorSchema.parse(await readJson(response));
  }
  assert.equal((await app.request(path + "/" + id, { method: "DELETE" })).status, 409);
  const customerEntity = await fixture.users.findById(UserIdSchema.parse(customer.id));
  assert(customerEntity);
  await fixture.users.update(customerEntity.disable(), customerEntity.snapshot().version);
  assert.equal((await app.request("/orders", request({ customerId: customer.id }))).status, 409);
});

void test("注文Repositoryの競合は409として返し、自動リトライしない", async () => {
  const users = MemoryUserRepository.create();
  const orders = MemoryOrderRepository.create();
  let writes = 0;
  const app = createTestApp({
    userRepository: users,
    passwordHasher,
    orderRepository: {
      ...orders,
      async insert(): Promise<void> {
        writes += 1;
        throw new ConflictError("do-not-expose");
      },
    },
  });
  const customer = PublicUserSchema.parse(
    await readJson(
      await app.request("/users", request({ name: "顧客", password: "demo-only-long-password" })),
    ),
  );
  const response = await app.request("/orders", request({ customerId: customer.id }));
  assert.equal(response.status, 409);
  assert.equal(writes, 1);
  assert(!(await response.text()).includes("do-not-expose"));
});

void test("Order OpenAPIは6操作・入力制約・計算結果・状態を文書化する", async () => {
  const document = await readJson(await setup().app.request("/openapi.json"));
  assert(readPath(document, "paths", "/orders", "post"));
  assert(readPath(document, "paths", "/orders/{id}", "get"));
  assert(readPath(document, "paths", "/orders/{id}/lines", "post"));
  assert(readPath(document, "paths", "/orders/{id}/lines/{lineId}", "patch"));
  assert(readPath(document, "paths", "/orders/{id}/lines/{lineId}", "delete"));
  assert(readPath(document, "paths", "/orders/{id}/confirm", "post"));
  assert.equal(
    readPath(document, "paths", "/orders/{id}/confirm", "post", "requestBody"),
    undefined,
  );
  const schemas = readPath(document, "components", "schemas");
  assert.equal(readPath(schemas, "AddOrderLine", "additionalProperties"), false);
  assert.equal(readPath(schemas, "AddOrderLine", "properties", "quantity", "minimum"), 1);
  assert.equal(readPath(schemas, "AddOrderLine", "properties", "quantity", "maximum"), 99);
  assert.equal(readPath(schemas, "AddOrderLine", "properties", "unitPriceYen", "type"), "integer");
  assert.equal(readPath(schemas, "PublicOrder", "properties", "lines", "maxItems"), 20);
  assert.deepEqual(readPath(schemas, "PublicOrder", "properties", "status", "enum"), [
    "draft",
    "confirmed",
  ]);
  assert.equal(readPath(schemas, "CreateOrder", "properties", "customerId", "format"), "uuid");
  assert.equal(
    readPath(schemas, "PublicOrderLine", "properties", "lineTotalYen", "type"),
    "integer",
  );
});
