import type { z } from "@hono/zod-openapi";
import { ErrorSchema } from "../schemas/common-schemas.js";

const responseHeaders = {
  "X-Request-ID": {
    description: "サーバーが生成した相関ID。認証には使いません。",
    schema: { type: "string" as const, format: "uuid" },
  },
  "Server-Timing": { description: "HTTP処理時間", schema: { type: "string" as const } },
};
type JsonResponseDefinition<T extends z.ZodType> = {
  description: string;
  headers: typeof responseHeaders;
  content: { "application/json": { schema: T } };
};
type JsonBodyDefinition<T extends z.ZodType> = {
  required: true;
  content: { "application/json": { schema: T } };
};

// スキーマの具体型を保持し、OpenAPIルートの入力・出力推論を失わない。
export function jsonResponse<T extends z.ZodType>(
  schema: T,
  description: string,
): JsonResponseDefinition<T> {
  return { description, headers: responseHeaders, content: { "application/json": { schema } } };
}
export function jsonBody<T extends z.ZodType>(schema: T): JsonBodyDefinition<T> {
  return { required: true, content: { "application/json": { schema } } };
}
export function errorResponse(description: string): JsonResponseDefinition<typeof ErrorSchema> {
  return jsonResponse(ErrorSchema, description);
}
export const commonErrors = {
  400: errorResponse("不正入力または不正JSON"),
  413: errorResponse("リクエスト本文が4096 bytesを超過"),
  500: errorResponse("内部エラー（詳細は返しません）"),
};
export const bodyErrors = {
  ...commonErrors,
  415: errorResponse("Content-Typeがapplication/jsonではありません"),
};
