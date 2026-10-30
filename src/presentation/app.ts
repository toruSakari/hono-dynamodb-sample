import { DynamoUserRepository } from "../infrastructure/dynamodb/repositories/user-repository.js";
import { DynamoOrderRepository } from "../infrastructure/dynamodb/repositories/order-repository.js";
import { UserService } from "../application/use-cases/user-service.js";
import { OrderService } from "../application/use-cases/order-service.js";
import { randomUUID } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { dbContext } from "./middleware/db-context.js";
import { requestContext } from "./middleware/request-context.js";
import type { HttpEnvironment } from "./middleware/request-context.js";
import { errorHandler } from "./middleware/error-handler.js";
import { registerUserRoutes } from "./routes/register-user-routes.js";
import { registerOrderRoutes } from "./routes/register-order-routes.js";
import { registerDocumentationRoutes } from "./routes/register-documentation-routes.js";
import { healthRoute } from "./routes/health-routes.js";

import type { AppDependencies, AppOptions } from "./dependencies.js";

// 手動 DI: factory実装は組立時に選び、各リクエストのcontrollerで依存を一度渡す。
export function createApp(
  dependencies: AppDependencies,
  options: AppOptions = {},
): OpenAPIHono<HttpEnvironment> {
  const app = new OpenAPIHono<HttpEnvironment>({
    defaultHook: (result, c) => {
      // Zod issues は機密入力を含み得るため公開しない。
      if (!result.success) {
        return c.json({ error: "入力が不正です" }, 400);
      }
    },
  });
  app.use(
    "*",
    requestContext(
      options.contextDependencies ?? {
        newRequestId: randomUUID,
        now: (): number => performance.now(),
      },
    ),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: 4096,
      onError: (c) => c.json({ error: "リクエスト本文が大きすぎます" }, 413),
    }),
  );
  app.use("*", dbContext(dependencies.db));
  app.openapi(healthRoute, (c) => c.json({ status: "ok" as const }, 200));
  // 差し替え/既定実装の選択は組立時だけ。ハンドラーにoptionsを持ち込まない。
  const userRepositoryFactory = options.userRepositoryFactory ?? DynamoUserRepository;
  const orderRepositoryFactory = options.orderRepositoryFactory ?? DynamoOrderRepository;
  registerUserRoutes(app, {
    userRepositoryFactory,
    userServiceFactory: options.userServiceFactory ?? UserService,
    passwordHasher: dependencies.passwordHasher,
  });
  registerOrderRoutes(app, {
    userRepositoryFactory,
    orderRepositoryFactory,
    orderServiceFactory: options.orderServiceFactory ?? OrderService,
  });
  registerDocumentationRoutes(app);
  app.notFound((c) => c.json({ error: "見つかりません" }, 404));
  app.onError(errorHandler);
  return app;
}
