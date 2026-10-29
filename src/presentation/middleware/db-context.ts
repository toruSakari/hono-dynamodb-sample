import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { DatabaseModels } from "../database.js";
import type { HttpEnvironment } from "./request-context.js";

// Composition Rootで設定したDBだけをContextへ載せる。
// Contextはpresentation内に留め、Repositoryとユースケースには渡さない。
export function dbContext(db: DatabaseModels): MiddlewareHandler<HttpEnvironment> {
  return createMiddleware<HttpEnvironment>(async (c, next) => {
    c.set("db", db);
    await next();
  });
}
