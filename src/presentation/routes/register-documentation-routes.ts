import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HttpEnvironment } from "../middleware/request-context.js";
import { swaggerUI } from "@hono/swagger-ui";

export function registerDocumentationRoutes(app: OpenAPIHono<HttpEnvironment>): void {
  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      version: "1.2.0",
      title: "DDD User and Order Sample API",
      description:
        "Hono + Zod + ElectroDB のローカル学習用API。認証・認可・レート制限未実装。実情報の入力・外部公開は禁止。",
    },
    servers: [{ url: "http://127.0.0.1:3000", description: "ローカル専用" }],
  });
  // Swagger UI はCDNから静的JS/CSSを取得する。実データ・実パスワードを入力しない。
  app.get("/docs", swaggerUI({ url: "/openapi.json", persistAuthorization: false }));
}
