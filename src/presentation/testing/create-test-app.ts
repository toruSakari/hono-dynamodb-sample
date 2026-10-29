import { createApp } from "../app.js";
import type { AppOptions } from "../dependencies.js";
import type { DatabaseModels } from "../database.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import type { OrderRepository } from "../../domain/repositories/order-repository.js";
import type { PasswordHasher } from "../../domain/services/password-hasher.js";
import { createUserModel } from "../../infrastructure/dynamodb/models/user-model.js";
import { createOrderModel } from "../../infrastructure/dynamodb/models/order-model.js";
import {
  documentClient,
  tableName,
  ordersTableName,
} from "../../infrastructure/dynamodb/client.js";

type TestDependencies = Readonly<{
  userRepository: UserRepository;
  orderRepository: OrderRepository;
  passwordHasher: PasswordHasher;
}>;

// モデル構築だけではI/Oを行わない。DBへは接続せず、型を偽装しない本物の設定済みモデルを使う。
export function createTestDatabase(): DatabaseModels {
  return Object.freeze({
    users: createUserModel(documentClient, tableName),
    orders: createOrderModel(documentClient, ordersTableName),
  });
}

// 通常のHTTPテストはRepository生成だけを差し替え、db middleware/controller経路は実行する。
export function createTestApp(
  dependencies: TestDependencies,
  options: AppOptions = {},
): ReturnType<typeof createApp> {
  return createApp(
    { db: createTestDatabase(), passwordHasher: dependencies.passwordHasher },
    {
      ...options,
      userRepositoryFactory: options.userRepositoryFactory ?? {
        create(): UserRepository {
          return dependencies.userRepository;
        },
      },
      orderRepositoryFactory: options.orderRepositoryFactory ?? {
        create(): OrderRepository {
          return dependencies.orderRepository;
        },
      },
    },
  );
}
