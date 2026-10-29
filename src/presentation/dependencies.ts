import type { UserRepository } from "../domain/repositories/user-repository.js";
import type { OrderRepository } from "../domain/repositories/order-repository.js";
import type { PasswordHasher } from "../domain/services/password-hasher.js";
import type { UserService } from "../application/use-cases/user-service.js";
import type { OrderService } from "../application/use-cases/order-service.js";
import type { RequestContextDependencies } from "./middleware/request-context.js";

// Composition Root が選んだアダプターを、各ユースケース呼び出しに明示的に渡す。
export type AppDependencies = Readonly<{
  userRepository: UserRepository;
  orderRepository: OrderRepository;
  passwordHasher: PasswordHasher;
}>;

// 操作オブジェクトは通常そのまま使う。テストでは境界検証用に差し替えられる。
export type AppOptions = Readonly<{
  contextDependencies?: RequestContextDependencies;
  userService?: UserService;
  orderService?: OrderService;
}>;
