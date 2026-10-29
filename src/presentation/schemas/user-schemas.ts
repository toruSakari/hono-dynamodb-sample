import { z } from "@hono/zod-openapi";
import {
  UserIdSchema,
  UserNameSchema,
  EmailAddressSchema,
  UserStatusSchema,
  NewPasswordSchema,
  PasswordCandidateSchema,
} from "../../domain/value-objects/index.js";

// ドメインの検証ルールを再利用し、HTTP 固有の説明はこの層で追加する。
// clone で OpenAPI 拡張登録前に生成された Zod インスタンスにも対応する。
const name = UserNameSchema.clone().openapi({
  description: "前後空白を除去した1〜50文字の表示名。制御文字不可。",
});
const email = EmailAddressSchema.clone().openapi({
  type: "string",
  format: "email",
  maxLength: 254,
  description: "構文検証のみ。所有権確認済みではありません。",
});
export const PublicUserSchema = z
  .strictObject({
    id: UserIdSchema,
    name,
    email: z.union([email, z.null()]),
    status: UserStatusSchema,
    version: z.number().int().nonnegative(),
  })
  .openapi("PublicUser");
export const UserParamsSchema = z.object({
  id: UserIdSchema.clone().openapi({
    param: { name: "id", in: "path" },
    description: "User の UUID",
  }),
});
export const CreateUserSchema = z
  .strictObject({
    name,
    email: email.optional(),
    password: NewPasswordSchema.clone().openapi({
      format: "password",
      writeOnly: true,
      description: "デモ専用の新規パスワード。15〜128文字。",
    }),
  })
  .openapi("CreateUser");
export const RenameSchema = z.strictObject({ name }).openapi("RenameUser");
export const ChangeEmailSchema = z.strictObject({ email }).openapi("ChangeEmail");
export const ChangePasswordSchema = z
  .strictObject({
    currentPassword: PasswordCandidateSchema.clone().openapi({
      format: "password",
      writeOnly: true,
    }),
    newPassword: NewPasswordSchema.clone().openapi({ format: "password", writeOnly: true }),
  })
  .openapi("ChangePassword");
