import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  NewPasswordSchema, PasswordHashSchema, UserIdSchema, UserNameSchema,
  type NewPassword, type PasswordHash, type UserId, type UserName,
} from './value-objects.js';

export interface PasswordHasher {
  hash(password: NewPassword): Promise<PasswordHash>;
  verify(hash: PasswordHash, candidate: string): Promise<boolean>;
}

const StoredUserSchema = z.strictObject({
  id: UserIdSchema,
  name: UserNameSchema,
  passwordHash: PasswordHashSchema,
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
});
export type StoredUser = Readonly<z.infer<typeof StoredUserSchema>>;
export type PublicUser = Readonly<{ id: UserId; name: UserName; version: number }>;
export type User = Readonly<{
  snapshot(): PublicUser;
  rename(name: UserName): User;
  changePassword(password: NewPassword, hasher: PasswordHasher): Promise<User>;
  verifyPassword(candidate: string, hasher: PasswordHasher): Promise<boolean>;
}>;

// 永続化用の機密情報は操作オブジェクトのプロパティに置かない。
// WeakMap はこのモジュールだけが保持する。HTTP 層は下記アクセサーを使用しない。
const persistence = new WeakMap<User, StoredUser>();

function build(input: StoredUser): User {
  // クロージャが保持する値もコピーして凍結し、呼び出し元の参照を切る。
  const state = Object.freeze(StoredUserSchema.parse(input));
  const user: User = Object.freeze({
    snapshot: () => Object.freeze({ id: state.id, name: state.name, version: state.version }),
    // 変更は新しいエンティティを返す。元のエンティティは変えない。
    rename: (name: UserName) => build({
      ...state, name: UserNameSchema.parse(name), version: state.version + 1,
    }),
    changePassword: async (password: NewPassword, hasher: PasswordHasher) => build({
      ...state,
      passwordHash: PasswordHashSchema.parse(await hasher.hash(NewPasswordSchema.parse(password))),
      version: state.version + 1,
    }),
    verifyPassword: async (candidate: string, hasher: PasswordHasher) =>
      candidate.length <= 128 && await hasher.verify(state.passwordHash, candidate),
  });
  persistence.set(user, state);
  return user;
}

export async function createUser(
  name: UserName, password: NewPassword, hasher: PasswordHasher,
): Promise<User> {
  // brand を不正な型アサーションで回避しても、境界で再検証する。
  const validName = UserNameSchema.parse(name);
  const validPassword = NewPasswordSchema.parse(password);
  return build({
    id: UserIdSchema.parse(randomUUID()), name: validName,
    passwordHash: PasswordHashSchema.parse(await hasher.hash(validPassword)), version: 0,
  });
}

// DB の値を信頼せず復元する。保存済みハッシュを再ハッシュしない。
export function restoreUser(record: unknown): User {
  return build(StoredUserSchema.parse(record));
}

// リポジトリ専用。公開 DTO ではなく、ログや HTTP 応答への出力は禁止。
// 暗号学的なアクセス制御ではないため、アプリ内の信頼境界も必要。
export function persistenceSnapshot(user: User): StoredUser {
  const state = persistence.get(user);
  if (!state) throw new TypeError('正規の User エンティティではありません');
  return Object.freeze({ ...state });
}
