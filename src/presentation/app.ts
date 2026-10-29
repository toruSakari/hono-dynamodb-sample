import { randomUUID } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import type { OrderService } from "../application/use-cases/order-service.js";
import type { UserService } from "../application/use-cases/user-service.js";
import { requestContext } from "./middleware/request-context.js";
import type { HttpEnvironment, RequestContextDependencies } from "./middleware/request-context.js";
import { errorHandler } from "./middleware/error-handler.js";
import { registerUserRoutes } from "./routes/register-user-routes.js";
import { registerOrderRoutes } from "./routes/register-order-routes.js";
import { registerDocumentationRoutes } from "./routes/register-documentation-routes.js";
import { healthRoute } from "./routes/health-routes.js";

// 手動 DI: HTTP 層はユースケースを受け取り、Repositoryやハッシュ実装は生成しない。
export function createApp(
  service: UserService,
  orderService: OrderService,
  contextDependencies: RequestContextDependencies = {
    newRequestId: randomUUID,
    now: (): number => performance.now(),
  },
): OpenAPIHono<HttpEnvironment> {
  const app = new OpenAPIHono<HttpEnvironment>({
    defaultHook: (result, c) => {
      // Zod issues は機密入力を含み得るため公開しない。
      if (!result.success) {
        return c.json({ error: "入力が不正です" }, 400);
      }
    },
  });
  app.use("*", requestContext(contextDependencies));
  app.use(
    "*",
    bodyLimit({
      maxSize: 4096,
      onError: (c) => c.json({ error: "リクエスト本文が大きすぎます" }, 413),
    }),
  );
  app.openapi(healthRoute, (c) => c.json({ status: "ok" as const }, 200));
  registerUserRoutes(app, service);
  registerOrderRoutes(app, orderService);
  registerDocumentationRoutes(app);
  app.notFound((c) => c.json({ error: "見つかりません" }, 404));
  app.onError(errorHandler);
  return app;
}
