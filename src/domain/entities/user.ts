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
// 公開項目は許可リスト。z.objectは未知項目（passwordやpasswordHash等）を取り除く。
// readonlyで型と実行時の両方を凍結し、保存スキーマとは分離する。
export const PublicUserSchema = z
  .object({
    id: UserIdSchema,
    name: UserNameSchema,
    email: EmailAddressSchema.nullable(),
    status: UserStatusSchema,
    version: AggregateVersionSchema,
  })
  .readonly();
export type PublicUser = z.infer<typeof PublicUserSchema>;
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
// 内部状態は振る舞いを持つ Password を保持する。保存用ハッシュとの二重保持はしない。
type UserState = Readonly<Omit<StoredUser, "passwordHash"> & { password: Password }>;
const states = new WeakMap<User, UserState>();

// ブランド値は入力境界で検証済み。内部で増やすバージョンの上限だけ確認する。
function build(input: UserState): User {
  const state: UserState = Object.freeze({
    ...input,
    version: AggregateVersionSchema.parse(input.version),
  });
  const requireActive = (): void => {
    if (state.status !== "active") {
      throw new DomainRuleError("無効なユーザーは変更できません");
    }
  };
  const user = Object.freeze<User>({
    // 公開 DTO はハッシュを含まず、コピーも不変にする。
    snapshot(): PublicUser {
      return PublicUserSchema.parse(state);
    },
    // 無効ユーザーのプロフィール変更を拒否し、新しい集約を返す。
    rename(name: UserName): User {
      requireActive();
      return build({ ...state, name, version: state.version + 1 });
    },
    // 構文検証済みのアドレスを受け取る。所有権確認済みという意味にはしない。
    changeEmail(email: EmailAddress): User {
      requireActive();
      return build({
        ...state,
        email,
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
      if (!(await state.password.matches(current, hasher))) {
        throw new InvalidCurrentPasswordError("現在のパスワードが一致しません");
      }
      const replacement = await Password.create(next, hasher);
      return build({
        ...state,
        password: replacement,
        version: state.version + 1,
      });
    },
    // 無効ユーザーは、正しいパスワードでも認証可能と判定しない。
    async verifyPassword(candidate: PasswordCandidate, hasher: PasswordHasher): Promise<boolean> {
      return state.status === "active" && (await state.password.matches(candidate, hasher));
    },
  });
  states.set(user, state);
  return user;
}

// エンティティの生成・復元・保存境界を一つの凍結した操作用オブジェクトへ集約する。
// 各 User の状態は引き続きクロージャ/WeakMapに閉じる。
export const User = Object.freeze({
  // 入力境界で検証済みのブランド値を受け取る。内部では再parseしない。
  async create(
    name: UserName,
    password: NewPassword,
    hasher: PasswordHasher,
    email?: EmailAddress,
  ): Promise<User> {
    const secret = await Password.create(password, hasher);
    return build({
      id: UserIdSchema.parse(randomUUID()),
      name,
      email: email ?? null,
      status: ActiveUserStatus,
      password: secret,
      version: 0,
    });
  },

  // DB の unknown を検証して復元する。保存済みハッシュを再ハッシュしない。
  restore(record: unknown): User {
    const stored = StoredUserSchema.parse(record);
    return build({
      id: stored.id,
      name: stored.name,
      email: stored.email,
      status: stored.status,
      version: stored.version,
      password: Password.restore(stored.passwordHash),
    });
  },

  // リポジトリ専用。公開 snapshot() と混同せず、HTTP 応答・ログに使用しない。
  toPersistenceSnapshot(user: User): StoredUser {
    const state = states.get(user);
    if (!state) {
      throw new TypeError("正規の User エンティティではありません");
    }
    // 保存境界でだけ Password をハッシュへ変換し、内部オブジェクトは持ち出さない。
    return Object.freeze({
      id: state.id,
      name: state.name,
      email: state.email,
      status: state.status,
      version: state.version,
      passwordHash: Password.toPersistenceSnapshot(state.password),
    });
  },
});
