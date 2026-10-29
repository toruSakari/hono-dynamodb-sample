import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { dbContext } from "./db-context.js";
import type { HttpEnvironment } from "./request-context.js";
import { createTestDatabase } from "../testing/create-test-app.js";
import { readJson } from "../testing/http-test-helpers.js";

void test("DB middlewareは設定済みモデルをtyped Contextへ載せ、HTTP入力で置き換えない", async () => {
  const db = createTestDatabase();
  const app = new Hono<HttpEnvironment>();
  app.use("*", dbContext(db));
  app.get("/inspect", (c) => {
    assert.equal(c.get("db"), db);
    assert.equal(c.get("db").users, db.users);
    assert.equal(c.get("db").orders, db.orders);
    return c.json({ ready: true });
  });
  const response = await app.request("/inspect?db=untrusted", {
    headers: { "X-Database": "untrusted" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), { ready: true });
});
