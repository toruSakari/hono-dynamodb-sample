import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../app.js";
import { createTestDatabase } from "../testing/create-test-app.js";
import { MemoryUserRepository } from "../../testing/repositories/memory-user-repository.js";
import { MemoryOrderRepository } from "../../testing/repositories/memory-order-repository.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import type { OrderRepository } from "../../domain/repositories/order-repository.js";
import type { UserModel } from "../../infrastructure/dynamodb/models/user-model.js";
import type { OrderModel } from "../../infrastructure/dynamodb/models/order-model.js";
import { passwordHasher } from "../../infrastructure/security/argon2-password-hasher.js";
import { UserService } from "../../application/use-cases/user-service.js";
import { OrderService } from "../../application/use-cases/order-service.js";
import type { PublicUser } from "../../domain/entities/user.js";
import type { PublicOrder } from "../../domain/entities/order.js";

void test("controllerはContext内の該当モデルだけをfactoryへ渡し、Serviceには生成Repositoryだけを渡す", async () => {
  const db = createTestDatabase();
  const users = MemoryUserRepository.create();
  const orders = MemoryOrderRepository.create();
  const calls = { userFactory: 0, orderFactory: 0, userFind: 0, orderFind: 0, orderCreate: 0 };
  const app = createApp(
    { db, passwordHasher },
    {
      userRepositoryFactory: {
        create(model: UserModel): UserRepository {
          assert.equal(model, db.users);
          calls.userFactory += 1;
          return users;
        },
      },
      orderRepositoryFactory: {
        create(model: OrderModel): OrderRepository {
          assert.equal(model, db.orders);
          calls.orderFactory += 1;
          return orders;
        },
      },
      userService: {
        ...UserService,
        async find(repository: UserRepository): Promise<PublicUser | null> {
          assert.equal(repository, users);
          calls.userFind += 1;
          return null;
        },
      },
      orderService: {
        ...OrderService,
        async find(repository: OrderRepository): Promise<PublicOrder | null> {
          assert.equal(repository, orders);
          calls.orderFind += 1;
          return null;
        },
        async create(
          repository: OrderRepository,
          customers: UserRepository,
        ): Promise<PublicOrder | null> {
          assert.equal(repository, orders);
          assert.equal(customers, users);
          calls.orderCreate += 1;
          return null;
        },
      },
    },
  );
  const id = "00000000-0000-4000-8000-000000000000";
  assert.equal((await app.request("/users/" + id)).status, 404);
  assert.equal(calls.orderFactory, 0);
  assert.equal((await app.request("/orders/" + id)).status, 404);
  assert.equal(calls.userFactory, 1);
  assert.equal(
    (
      await app.request("/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId: id }),
      })
    ).status,
    404,
  );
  assert.deepEqual(calls, {
    userFactory: 2,
    orderFactory: 2,
    userFind: 1,
    orderFind: 1,
    orderCreate: 1,
  });
});
