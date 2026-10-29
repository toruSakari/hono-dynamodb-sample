import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  UserIdSchema, UserNameSchema, EmailAddressSchema, UserStatusSchema,
  ActiveUserStatus, DisabledUserStatus, PasswordCandidateSchema,
  type NewPassword, type PasswordCandidate, type UserId, type UserName,
  type EmailAddress, type UserStatus,
} from '../value-objects/index.js';
import { PasswordHashSchema } from '../value-objects/password-hash.js';
import { createPassword, restorePassword, passwordHashForPersistence } from '../value-objects/password.js';
import type { PasswordHasher } from '../services/password-hasher.js';
import { DomainRuleError, InvalidCurrentPasswordError } from '../errors/domain-rule-error.js';

const StoredUserSchema = z.strictObject({
  id: UserIdSchema,
  name: UserNameSchema,
  passwordHash: PasswordHashSchema,
  // 初版の保存レコードを復元できるよう、省略時だけ既定値を適用する。
  email: EmailAddressSchema.nullable().default(null),
  status: UserStatusSchema.default(ActiveUserStatus),
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
});
export type StoredUser = Readonly<z.infer<typeof StoredUserSchema>>;
export type PublicUser = Readonly<{
  id: UserId; name: UserName; email: EmailAddress | null; status: UserStatus; version: number;
}>;
export type User = Readonly<{
  snapshot(): PublicUser;
  rename(name: UserName): User;
  changeEmail(email: EmailAddress): User;
  disable(): User;
  reactivate(): User;
  changePassword(current: PasswordCandidate, next: NewPassword, hasher: PasswordHasher): Promise<User>;
  verifyPassword(candidate: PasswordCandidate, hasher: PasswordHasher): Promise<boolean>;
}>;
const persistence = new WeakMap<User, StoredUser>();

function build(input: StoredUser): User {
  const state = Object.freeze(StoredUserSchema.parse(input));
  const password = restorePassword(state.passwordHash);
  const requireActive = () => {
    if (state.status !== 'active') throw new DomainRuleError('無効なユーザーは変更できません');
  };
  const user = Object.freeze<User>({
    // 公開 DTO はハッシュを含まず、コピーも不変にする。
    snapshot: () => Object.freeze({
      id: state.id, name: state.name, email: state.email, status: state.status, version: state.version,
    }),
    // 無効ユーザーのプロフィール変更を拒否し、新しい集約を返す。
    rename: (name) => {
      requireActive();
      return build({ ...state, name: UserNameSchema.parse(name), version: state.version + 1 });
    },
    // アドレスの構文だけを検証する。所有権確認済みという意味にはしない。
    changeEmail: (email) => {
      requireActive();
      return build({ ...state, email: EmailAddressSchema.parse(email), version: state.version + 1 });
    },
    // 無効化で照合とプロフィール変更を停止する。二重無効化は不正遷移。
    disable: () => {
      requireActive();
      return build({ ...state, status: DisabledUserStatus, version: state.version + 1 });
    },
    // 無効状態からだけ復帰できる。実アプリでは管理者の認可が別途必要。
    reactivate: () => {
      if (state.status !== 'disabled') throw new DomainRuleError('有効ユーザーは再有効化できません');
      return build({ ...state, status: ActiveUserStatus, version: state.version + 1 });
    },
    // 本人の現在のパスワードが一致した場合だけ変更する。管理者リセットとは別の操作。
    changePassword: async (current, next, hasher) => {
      requireActive();
      if (!await password.matches(current, hasher)) throw new InvalidCurrentPasswordError('現在のパスワードが一致しません');
      const replacement = await createPassword(next, hasher);
      return build({ ...state, passwordHash: passwordHashForPersistence(replacement), version: state.version + 1 });
    },
    // 無効ユーザーは、正しいパスワードでも認証可能と判定しない。
    verifyPassword: async (candidate, hasher) => {
      const valid = PasswordCandidateSchema.parse(candidate);
      return state.status === 'active' && await password.matches(valid, hasher);
    },
  });
  persistence.set(user, state);
  return user;
}

// 生成時点で検証済みブランド値を要求し、実行時にも不正な型アサーションを防ぐ。
async function createUser(
  name: UserName, password: NewPassword, hasher: PasswordHasher, email?: EmailAddress,
): Promise<User> {
  const validName = UserNameSchema.parse(name);
  const validEmail = email === undefined ? null : EmailAddressSchema.parse(email);
  const secret = await createPassword(password, hasher);
  return build({
    id: UserIdSchema.parse(randomUUID()), name: validName, email: validEmail,
    status: ActiveUserStatus, passwordHash: passwordHashForPersistence(secret), version: 0,
  });
}

// DB の unknown を検証して復元する。保存済みハッシュを再ハッシュしない。
function restoreUser(record: unknown): User {
  return build(StoredUserSchema.parse(record));
}

// リポジトリ専用。HTTP 応答・ログに使用しない（プロセス内の権限制御ではない）。
function persistenceSnapshot(user: User): StoredUser {
  const state = persistence.get(user);
  if (!state) throw new TypeError('正規の User エンティティではありません');
  return Object.freeze({ ...state });
}

// エンティティの生成・復元・保存境界を一つの凍結した操作用オブジェクトへ集約する。
// これはインスタンスの状態ではない。各 User の状態は引き続きクロージャ/WeakMapに閉じる。
// toPersistenceSnapshot はリポジトリ専用で、公開 snapshot() と混同しない。
export const User = Object.freeze({
  create: createUser,
  restore: restoreUser,
  toPersistenceSnapshot: persistenceSnapshot,
});
