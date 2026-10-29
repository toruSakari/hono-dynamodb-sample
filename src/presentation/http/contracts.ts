import { createRoute, z } from '@hono/zod-openapi';
import {
  UserIdSchema, UserNameSchema, EmailAddressSchema, UserStatusSchema,
  NewPasswordSchema, PasswordCandidateSchema,
} from '../../domain/value-objects/index.js';

// ドメインの検証ルールを再利用し、HTTP 固有の説明はこの層で追加する。
// clone で OpenAPI 拡張登録前に生成された Zod インスタンスにも対応する。
const name = UserNameSchema.clone().openapi({ description: '前後空白を除去した1〜50文字の表示名。制御文字不可。' });
const email = EmailAddressSchema.clone().openapi({ type: 'string', format: 'email', maxLength: 254, description: '構文検証のみ。所有権確認済みではありません。' });
export const PublicUserSchema = z.strictObject({
  id: UserIdSchema,
  name,
  email: z.union([email, z.null()]),
  status: UserStatusSchema,
  version: z.number().int().nonnegative(),
}).openapi('PublicUser');
export const ErrorSchema = z.strictObject({ error: z.string() }).openapi('Error');
export const HealthSchema = z.strictObject({ status: z.literal('ok') }).openapi('Health');
const params = z.object({
  id: UserIdSchema.clone().openapi({ param: { name: 'id', in: 'path' }, description: 'User の UUID' }),
});
export const CreateUserSchema = z.strictObject({
  name,
  email: email.optional(),
  password: NewPasswordSchema.clone().openapi({ format: 'password', writeOnly: true, description: 'デモ専用の新規パスワード。15〜128文字。' }),
}).openapi('CreateUser');
export const RenameSchema = z.strictObject({ name }).openapi('RenameUser');
export const ChangeEmailSchema = z.strictObject({ email }).openapi('ChangeEmail');
export const ChangePasswordSchema = z.strictObject({
  currentPassword: PasswordCandidateSchema.clone().openapi({ format: 'password', writeOnly: true }),
  newPassword: NewPasswordSchema.clone().openapi({ format: 'password', writeOnly: true }),
}).openapi('ChangePassword');

const headers = {
  'X-Request-ID': { description: 'サーバーが生成した相関ID。認証には使いません。', schema: { type: 'string' as const, format: 'uuid' } },
  'Server-Timing': { description: 'HTTP処理時間', schema: { type: 'string' as const } },
};
function response<T extends z.ZodType>(schema: T, description: string) {
  return { description, headers, content: { 'application/json': { schema } } };
}
const error = (description: string) => response(ErrorSchema, description);
const commonErrors = {
  400: error('不正入力または不正JSON'),
  413: error('リクエスト本文が4096 bytesを超過'),
  500: error('内部エラー（詳細は返しません）'),
};
const bodyErrors = { ...commonErrors, 415: error('Content-Typeがapplication/jsonではありません') };
const updateErrors = { ...bodyErrors, 404: error('Userが存在しません'), 409: error('並行更新の競合または無効Userの操作') };
function body<T extends z.ZodType>(schema: T) {
  return { required: true, content: { 'application/json': { schema } } };
}

export const healthRoute = createRoute({
  method: 'get', path: '/health', operationId: 'health', tags: ['Health'],
  summary: 'プロセスの生存確認（DB確認ではない）',
  responses: { 200: response(HealthSchema, '起動中'), 413: commonErrors[413], 500: commonErrors[500] },
});
export const createUserRoute = createRoute({
  method: 'post', path: '/users', operationId: 'User.create', tags: ['Users'],
  summary: 'Userを登録する（ローカル学習用）',
  request: { body: body(CreateUserSchema) },
  responses: { 201: response(PublicUserSchema, '作成済み'), ...bodyErrors, 409: error('IDの競合') },
});
export const getUserRoute = createRoute({
  method: 'get', path: '/users/{id}', operationId: 'getUser', tags: ['Users'],
  request: { params },
  responses: { 200: response(PublicUserSchema, '公開スナップショット'), ...commonErrors, 404: error('Userが存在しません') },
});
export const renameRoute = createRoute({
  method: 'patch', path: '/users/{id}/name', operationId: 'renameUser', tags: ['Users'],
  request: { params, body: body(RenameSchema) },
  responses: { 200: response(PublicUserSchema, '改名後の公開スナップショット'), ...updateErrors },
});
export const changeEmailRoute = createRoute({
  method: 'patch', path: '/users/{id}/email', operationId: 'changeEmail', tags: ['Users'],
  request: { params, body: body(ChangeEmailSchema) },
  responses: { 200: response(PublicUserSchema, '変更後の公開スナップショット'), ...updateErrors },
});
export const changePasswordRoute = createRoute({
  method: 'patch', path: '/users/{id}/password', operationId: 'changePassword', tags: ['Users'],
  description: '現在パスワードとの一致が必要。セッション認証・認可・レート制限の代替ではありません。',
  request: { params, body: body(ChangePasswordSchema) },
  responses: { 200: response(PublicUserSchema, 'ハッシュを含まない公開スナップショット'), ...updateErrors, 403: error('現在パスワードが不一致') },
});
