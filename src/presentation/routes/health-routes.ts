import { createRoute } from "@hono/zod-openapi";
import { HealthSchema } from "../schemas/common-schemas.js";
import { jsonResponse, commonErrors } from "./responses.js";

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  operationId: "health",
  tags: ["Health"],
  summary: "プロセスの生存確認（DB確認ではない）",
  responses: {
    200: jsonResponse(HealthSchema, "起動中"),
    413: commonErrors[413],
    500: commonErrors[500],
  },
});
