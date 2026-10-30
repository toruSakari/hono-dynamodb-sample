import type { PasswordHasher } from "../services/password-hasher.js";
import type { NewPassword } from "./new-password.js";
import type { PasswordCandidate } from "./password-candidate.js";
import { PasswordHashSchema } from "./password-hash.js";
import type { PasswordHash } from "./password-hash.js";

export type Password = Readonly<{
  matches(candidate: PasswordCandidate, hasher: PasswordHasher): Promise<boolean>;
}>;
const persistence = new WeakMap<Password, PasswordHash>();

function build(hash: PasswordHash): Password {
  const password = Object.freeze<Password>({
    // ソルト付きハッシュの単純比較ではなく、平文候補をアルゴリズムで照合する。
    matches(candidate: PasswordCandidate, hasher: PasswordHasher): Promise<boolean> {
      return hasher.verify(hash, candidate);
    },
  });
  persistence.set(password, hash);
  return password;
}

// User / Order と同じ生成・復元・保存API。平文は保持せず、ハッシュだけを隠蔽する。
export const Password = Object.freeze({
  async create(input: NewPassword, hasher: PasswordHasher): Promise<Password> {
    return build(await hasher.hash(input));
  },

  // 復元で再ハッシュしない。保存形式だけを検証する。
  restore(record: unknown): Password {
    return build(PasswordHashSchema.parse(record));
  },

  // 集約の保存境界だけで使用する。公開DTOやログには出力しない。
  toPersistenceSnapshot(password: Password): PasswordHash {
    const hash = persistence.get(password);
    if (!hash) {
      throw new TypeError("正規の Password 値オブジェクトではありません");
    }
    return hash;
  },
});
