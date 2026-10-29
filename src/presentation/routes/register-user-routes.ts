import type { AppDependencies } from "../dependencies.js";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HttpEnvironment } from "../middleware/request-context.js";
import { UserService } from "../../application/use-cases/user-service.js";
import { PublicUserSchema } from "../schemas/user-schemas.js";
import {
  createUserRoute,
  getUserRoute,
  renameRoute,
  changeEmailRoute,
  changePasswordRoute,
} from "./user-routes.js";

function registerUserReadRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: AppDependencies,
  service: UserService,
): void {
  app.openapi(createUserRoute, async (c) => {
    const input = c.req.valid("json");
    return c.json(
      PublicUserSchema.parse(
        await service.register(
          dependencies.userRepository,
          dependencies.passwordHasher,
          input.name,
          input.password,
          input.email,
        ),
      ),
      201,
    );
  });
  app.openapi(getUserRoute, async (c) => {
    const user = await service.find(dependencies.userRepository, c.req.valid("param").id);
    return user
      ? c.json(PublicUserSchema.parse(user), 200)
      : c.json({ error: "見つかりません" }, 404);
  });
}

function registerUserMutationRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: AppDependencies,
  service: UserService,
): void {
  app.openapi(renameRoute, async (c) => {
    const user = await service.rename(
      dependencies.userRepository,
      c.req.valid("param").id,
      c.req.valid("json").name,
    );
    return user
      ? c.json(PublicUserSchema.parse(user), 200)
      : c.json({ error: "見つかりません" }, 404);
  });
  app.openapi(changeEmailRoute, async (c) => {
    const user = await service.changeEmail(
      dependencies.userRepository,
      c.req.valid("param").id,
      c.req.valid("json").email,
    );
    return user
      ? c.json(PublicUserSchema.parse(user), 200)
      : c.json({ error: "見つかりません" }, 404);
  });
  app.openapi(changePasswordRoute, async (c) => {
    const input = c.req.valid("json");
    const user = await service.changePassword(
      dependencies.userRepository,
      dependencies.passwordHasher,
      c.req.valid("param").id,
      input.currentPassword,
      input.newPassword,
    );
    return user
      ? c.json(PublicUserSchema.parse(user), 200)
      : c.json({ error: "見つかりません" }, 404);
  });
}

// ルート登録時にユースケースを明示的に受け取り、HTTPコンテキストをドメインへ渡さない。
export function registerUserRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: AppDependencies,
  service: UserService = UserService,
): void {
  registerUserReadRoutes(app, dependencies, service);
  registerUserMutationRoutes(app, dependencies, service);
}
