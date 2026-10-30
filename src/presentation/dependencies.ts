import type { DatabaseModels } from "./database.js";
import type { DynamoUserRepository } from "../infrastructure/dynamodb/repositories/user-repository.js";
import type { DynamoOrderRepository } from "../infrastructure/dynamodb/repositories/order-repository.js";
import type { PasswordHasher } from "../domain/services/password-hasher.js";
import type { UserService } from "../application/use-cases/user-service.js";
import type { OrderService } from "../application/use-cases/order-service.js";
import type { RequestContextDependencies } from "./middleware/request-context.js";

// Composition Root が選んだアダプターを、各ユースケース呼び出しに明示的に渡す。
export type AppDependencies = Readonly<{
  db: DatabaseModels;
  passwordHasher: PasswordHasher;
}>;

// 操作オブジェクトは通常そのまま使う。テストでは境界検証用に差し替えられる。
export type AppOptions = Readonly<{
  contextDependencies?: RequestContextDependencies;
  userRepositoryFactory?: typeof DynamoUserRepository;
  orderRepositoryFactory?: typeof DynamoOrderRepository;
  userServiceFactory?: typeof UserService;
  orderServiceFactory?: typeof OrderService;
}>;

// コントローラーには組立時に確定した依存だけを渡す。dbはContextから取得する。
export type UserRouteDependencies = Readonly<{
  userRepositoryFactory: typeof DynamoUserRepository;
  userServiceFactory: typeof UserService;
  passwordHasher: PasswordHasher;
}>;
export type OrderRouteDependencies = Readonly<{
  userRepositoryFactory: typeof DynamoUserRepository;
  orderRepositoryFactory: typeof DynamoOrderRepository;
  orderServiceFactory: typeof OrderService;
}>;
