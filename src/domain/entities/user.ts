import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AggregateVersionSchema } from "../value-objects/aggregate-version.js";
import {
  UserIdSchema,
  UserNameSchema,
  EmailAddressSchema,
  UserStatusSchema,
  ActiveUserStatus,
  DisabledUserStatus,
  PasswordCandidateSchema,
} from "../value-objects/index.js";
import type {
  NewPassword,
  PasswordCandidate,
  UserName,
  EmailAddress,
} from "../value-objects/index.js";
import { PasswordHashSchema } from "../value-objects/password-hash.js";
import { Password } from "../value-objects/password.js";
import type { PasswordHasher } from "../services/password-hasher.js";
import { DomainRuleError, InvalidCurrentPasswordError } from "../errors/domain-rule-error.js";

const StoredUserSchema = z.strictObject({
  id: UserIdSchema,
  name: UserNameSchema,
  passwordHash: PasswordHashSchema,
  // 初版の保存レコードを復元できるよう、省略時だけ既定値を適用する。
  email: EmailAddressSchema.nullable().default(null),
  status: UserStatusSchema.default(ActiveUserStatus),
  version: AggregateVersionSchema,
});
export type StoredUser = Readonly<z.infer<typeof StoredUserSchema>>;
// 公開項目を許可リストで選ぶ。保存型に秘密情報が増えても自動公開されない。
export type PublicUser = Readonly<Pick<StoredUser, "id" | "name" | "email" | "status" | "version">>;
export type User = Readonly<{
  snapshot(): PublicUser;
  rename(name: UserName): User;
  changeEmail(email: EmailAddress): User;
  disable(): User;
  reactivate(): User;
  changePassword(
    current: PasswordCandidate,
    next: NewPassword,
    hasher: PasswordHasher,
  ): Promise<User>;
  verifyPassword(candidate: PasswordCandidate, hasher: PasswordHasher): Promise<boolean>;
}>;
const persistence = new WeakMap<User, StoredUser>();

function build(input: unknown): User {
  const state = Object.freeze(StoredUserSchema.parse(input));
  const password = Password.restore(state.passwordHash);
  const requireActive = (): void => {
    if (state.status !== "active") {
      throw new DomainRuleError("無効なユーザーは変更できません");
    }
  };
  const user = Object.freeze<User>({
    // 公開 DTO はハッシュを含まず、コピーも不変にする。
    snapshot(): PublicUser {
      return Object.freeze({
        id: state.id,
        name: state.name,
        email: state.email,
        status: state.status,
        version: state.version,
      });
    },
    // 無効ユーザーのプロフィール変更を拒否し、新しい集約を返す。
    rename(name: UserName): User {
      requireActive();
      return build({ ...state, name: UserNameSchema.parse(name), version: state.version + 1 });
    },
    // アドレスの構文だけを検証する。所有権確認済みという意味にはしない。
    changeEmail(email: EmailAddress): User {
      requireActive();
      return build({
        ...state,
        email: EmailAddressSchema.parse(email),
        version: state.version + 1,
      });
    },
    // 無効化で照合とプロフィール変更を停止する。二重無効化は不正遷移。
    disable(): User {
      requireActive();
      return build({ ...state, status: DisabledUserStatus, version: state.version + 1 });
    },
    // 無効状態からだけ復帰できる。実アプリでは管理者の認可が別途必要。
    reactivate(): User {
      if (state.status !== "disabled") {
        throw new DomainRuleError("有効ユーザーは再有効化できません");
      }
      return build({ ...state, status: ActiveUserStatus, version: state.version + 1 });
    },
    // 本人の現在のパスワードが一致した場合だけ変更する。管理者リセットとは別の操作。
    async changePassword(
      current: PasswordCandidate,
      next: NewPassword,
      hasher: PasswordHasher,
    ): Promise<User> {
      requireActive();
      if (!(await password.matches(current, hasher))) {
        throw new InvalidCurrentPasswordError("現在のパスワードが一致しません");
      }
      const replacement = await Password.create(next, hasher);
      return build({
        ...state,
        passwordHash: Password.toPersistenceSnapshot(replacement),
        version: state.version + 1,
      });
    },
    // 無効ユーザーは、正しいパスワードでも認証可能と判定しない。
    async verifyPassword(candidate: PasswordCandidate, hasher: PasswordHasher): Promise<boolean> {
      const valid = PasswordCandidateSchema.parse(candidate);
      return state.status === "active" && (await password.matches(valid, hasher));
    },
  });
  persistence.set(user, state);
  return user;
}

// エンティティの生成・復元・保存境界を一つの凍結した操作用オブジェクトへ集約する。
// 各 User の状態は引き続きクロージャ/WeakMapに閉じる。
export const User = Object.freeze({
  // 検証済みブランド値を要求し、実行時にも不正な型アサーションを防ぐ。
  async create(
    name: UserName,
    password: NewPassword,
    hasher: PasswordHasher,
    email?: EmailAddress,
  ): Promise<User> {
    const validName = UserNameSchema.parse(name);
    const validEmail = email === undefined ? null : EmailAddressSchema.parse(email);
    const secret = await Password.create(password, hasher);
    return build({
      id: UserIdSchema.parse(randomUUID()),
      name: validName,
      email: validEmail,
      status: ActiveUserStatus,
      passwordHash: Password.toPersistenceSnapshot(secret),
      version: 0,
    });
  },

  // DB の unknown を検証して復元する。保存済みハッシュを再ハッシュしない。
  restore(record: unknown): User {
    return build(record);
  },

  // リポジトリ専用。公開 snapshot() と混同せず、HTTP 応答・ログに使用しない。
  toPersistenceSnapshot(user: User): StoredUser {
    const state = persistence.get(user);
    if (!state) {
      throw new TypeError("正規の User エンティティではありません");
    }
    return Object.freeze({ ...state });
  },
});
