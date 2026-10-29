import { createRoute } from "@hono/zod-openapi";
import {
  CreateUserSchema,
  PublicUserSchema,
  RenameSchema,
  ChangeEmailSchema,
  ChangePasswordSchema,
  UserParamsSchema,
} from "../schemas/user-schemas.js";
import {
  jsonResponse as response,
  jsonBody as body,
  errorResponse as error,
  commonErrors,
  bodyErrors,
} from "./responses.js";
const updateErrors = {
  ...bodyErrors,
  404: error("Userが存在しません"),
  409: error("並行更新の競合または無効Userの操作"),
};

export const createUserRoute = createRoute({
  method: "post",
  path: "/users",
  operationId: "User.create",
  tags: ["Users"],
  summary: "Userを登録する（ローカル学習用）",
  request: { body: body(CreateUserSchema) },
  responses: { 201: response(PublicUserSchema, "作成済み"), ...bodyErrors, 409: error("IDの競合") },
});
export const getUserRoute = createRoute({
  method: "get",
  path: "/users/{id}",
  operationId: "getUser",
  tags: ["Users"],
  request: { params: UserParamsSchema },
  responses: {
    200: response(PublicUserSchema, "公開スナップショット"),
    ...commonErrors,
    404: error("Userが存在しません"),
  },
});
export const renameRoute = createRoute({
  method: "patch",
  path: "/users/{id}/name",
  operationId: "renameUser",
  tags: ["Users"],
  request: { params: UserParamsSchema, body: body(RenameSchema) },
  responses: { 200: response(PublicUserSchema, "改名後の公開スナップショット"), ...updateErrors },
});
export const changeEmailRoute = createRoute({
  method: "patch",
  path: "/users/{id}/email",
  operationId: "changeEmail",
  tags: ["Users"],
  request: { params: UserParamsSchema, body: body(ChangeEmailSchema) },
  responses: { 200: response(PublicUserSchema, "変更後の公開スナップショット"), ...updateErrors },
});
export const changePasswordRoute = createRoute({
  method: "patch",
  path: "/users/{id}/password",
  operationId: "changePassword",
  tags: ["Users"],
  description:
    "現在パスワードとの一致が必要。セッション認証・認可・レート制限の代替ではありません。",
  request: { params: UserParamsSchema, body: body(ChangePasswordSchema) },
  responses: {
    200: response(PublicUserSchema, "ハッシュを含まない公開スナップショット"),
    ...updateErrors,
    403: error("現在パスワードが不一致"),
  },
});
