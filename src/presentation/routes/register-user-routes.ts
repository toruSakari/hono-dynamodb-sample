import type { UserRouteDependencies } from "../dependencies.js";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HttpEnvironment } from "../middleware/request-context.js";
import {
  createUserRoute,
  getUserRoute,
  renameRoute,
  changeEmailRoute,
  changePasswordRoute,
} from "./user-routes.js";

function registerUserReadRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: UserRouteDependencies,
): void {
  app.openapi(createUserRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.userRepositoryFactory.create(db.users);
    const input = c.req.valid("json");
    return c.json(
      await dependencies.userService.register(
        repository,
        dependencies.passwordHasher,
        input.name,
        input.password,
        input.email,
      ),
      201,
    );
  });
  app.openapi(getUserRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.userRepositoryFactory.create(db.users);
    const user = await dependencies.userService.find(repository, c.req.valid("param").id);
    return user ? c.json(user, 200) : c.json({ error: "見つかりません" }, 404);
  });
}

function registerUserMutationRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: UserRouteDependencies,
): void {
  app.openapi(renameRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.userRepositoryFactory.create(db.users);
    const user = await dependencies.userService.rename(
      repository,
      c.req.valid("param").id,
      c.req.valid("json").name,
    );
    return user ? c.json(user, 200) : c.json({ error: "見つかりません" }, 404);
  });
  app.openapi(changeEmailRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.userRepositoryFactory.create(db.users);
    const user = await dependencies.userService.changeEmail(
      repository,
      c.req.valid("param").id,
      c.req.valid("json").email,
    );
    return user ? c.json(user, 200) : c.json({ error: "見つかりません" }, 404);
  });
  app.openapi(changePasswordRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.userRepositoryFactory.create(db.users);
    const input = c.req.valid("json");
    const user = await dependencies.userService.changePassword(
      repository,
      dependencies.passwordHasher,
      c.req.valid("param").id,
      input.currentPassword,
      input.newPassword,
    );
    return user ? c.json(user, 200) : c.json({ error: "見つかりません" }, 404);
  });
}

// ルート登録時にユースケースを明示的に受け取り、HTTPコンテキストをドメインへ渡さない。
export function registerUserRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: UserRouteDependencies,
): void {
  registerUserReadRoutes(app, dependencies);
  registerUserMutationRoutes(app, dependencies);
}
