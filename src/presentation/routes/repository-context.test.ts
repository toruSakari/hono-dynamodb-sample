import type { PasswordHasher } from "../../domain/services/password-hasher.js";
import type { UserId } from "../../domain/value-objects/user-id.js";
import type { OrderId } from "../../domain/value-objects/order-id.js";
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

void test("controllerはモデルからRepositoryを作り、Service factoryへ依存を一度渡して業務引数だけで操作する", async () => {
  const db = createTestDatabase();
  const users = MemoryUserRepository.create();
  const orders = MemoryOrderRepository.create();
  const id = "00000000-0000-4000-8000-000000000000";
  const calls = {
    userFactory: 0,
    orderFactory: 0,
    userServiceFactory: 0,
    orderServiceFactory: 0,
    userFind: 0,
    orderFind: 0,
    orderCreate: 0,
  };
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
      userServiceFactory: {
        create(repository: UserRepository, hasher: PasswordHasher): UserService {
          assert.equal(repository, users);
          assert.equal(hasher, passwordHasher);
          calls.userServiceFactory += 1;
          return Object.freeze({
            ...UserService.create(repository, hasher),
            async find(userId: UserId): Promise<PublicUser | null> {
              assert.equal(userId, id);
              calls.userFind += 1;
              return null;
            },
          });
        },
      },
      orderServiceFactory: {
        create(repository: OrderRepository, customers: UserRepository): OrderService {
          assert.equal(repository, orders);
          assert.equal(customers, users);
          calls.orderServiceFactory += 1;
          return Object.freeze({
            ...OrderService.create(repository, customers),
            async find(orderId: OrderId): Promise<PublicOrder | null> {
              assert.equal(orderId, id);
              calls.orderFind += 1;
              return null;
            },
            async create(customerId: UserId): Promise<PublicOrder | null> {
              assert.equal(customerId, id);
              calls.orderCreate += 1;
              return null;
            },
          });
        },
      },
    },
  );
  assert.equal((await app.request("/users/" + id)).status, 404);
  assert.equal(calls.orderFactory, 0);
  assert.equal((await app.request("/orders/" + id)).status, 404);
  assert.equal(calls.userFactory, 2);
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
    userFactory: 3,
    orderFactory: 2,
    userServiceFactory: 1,
    orderServiceFactory: 2,
    userFind: 1,
    orderFind: 1,
    orderCreate: 1,
  });
});

void test("差し替え依存はアプリ組立時に一度だけ選択し、リクエストごとにoptionsを読み直さない", async () => {
  const db = createTestDatabase();
  const users = MemoryUserRepository.create();
  const orders = MemoryOrderRepository.create();
  const reads = { userFactory: 0, orderFactory: 0, userService: 0, orderService: 0 };
  const userFactory = {
    create(): UserRepository {
      return users;
    },
  };
  const orderFactory = {
    create(): OrderRepository {
      return orders;
    },
  };
  const app = createApp(
    { db, passwordHasher },
    {
      get userRepositoryFactory(): typeof userFactory {
        reads.userFactory += 1;
        return userFactory;
      },
      get orderRepositoryFactory(): typeof orderFactory {
        reads.orderFactory += 1;
        return orderFactory;
      },
      get userServiceFactory(): typeof UserService {
        reads.userService += 1;
        return UserService;
      },
      get orderServiceFactory(): typeof OrderService {
        reads.orderService += 1;
        return OrderService;
      },
    },
  );
  const expected = { userFactory: 1, orderFactory: 1, userService: 1, orderService: 1 };
  assert.deepEqual(reads, expected);
  const id = "00000000-0000-4000-8000-000000000000";
  for (const path of ["/users/" + id, "/orders/" + id, "/users/" + id]) {
    assert.equal((await app.request(path)).status, 404);
  }
  assert.deepEqual(reads, expected);
});
