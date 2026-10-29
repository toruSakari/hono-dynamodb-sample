import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryOrderRepository } from "./memory-order-repository.js";
import { Order } from "../../domain/entities/order.js";
import { UserIdSchema } from "../../domain/value-objects/user-id.js";

void test("MemoryOrderRepository.createは凍結Repositoryと独立した状態を組み立てる", async () => {
  const first = MemoryOrderRepository.create();
  const second = MemoryOrderRepository.create();
  assert(Object.isFrozen(MemoryOrderRepository));
  assert(Object.isFrozen(first));
  assert.notEqual(first, second);
  const order = Order.create(UserIdSchema.parse("00000000-0000-4000-8000-000000000000"));
  await first.insert(order);
  assert(await first.findById(order.snapshot().id));
  assert.equal(await second.findById(order.snapshot().id), null);
});
