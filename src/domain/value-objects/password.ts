import type { PasswordHasher } from '../services/password-hasher.js';
import { NewPasswordSchema, type NewPassword } from './new-password.js';
import { PasswordCandidateSchema, type PasswordCandidate } from './password-candidate.js';
import { PasswordHashSchema, type PasswordHash } from './password-hash.js';

export type Password = Readonly<{
  matches(candidate: PasswordCandidate, hasher: PasswordHasher): Promise<boolean>;
}>;
const storedHashes = new WeakMap<Password, PasswordHash>();

// 保存されたハッシュから復元する。新規パスワードのルールや再ハッシュは適用しない。
export function restorePassword(input: unknown): Password {
  const hash = PasswordHashSchema.parse(input);
  const password = Object.freeze<Password>({
    // ソルト付きハッシュ同士の文字列比較ではなく、アルゴリズムで平文候補を照合する。
    matches: (candidate, hasher) => hasher.verify(hash, PasswordCandidateSchema.parse(candidate)),
  });
  storedHashes.set(password, hash);
  return password;
}

// 平文を閉じ込めるのではなく、検証後ただちにハッシュへ変換する。
export async function createPassword(input: NewPassword, hasher: PasswordHasher): Promise<Password> {
  return restorePassword(await hasher.hash(NewPasswordSchema.parse(input)));
}

// 集約の永続化境界だけで使用。値オブジェクト自体の JSON にはハッシュが現れない。
export function passwordHashForPersistence(password: Password): PasswordHash {
  const hash = storedHashes.get(password);
  if (!hash) throw new TypeError('正規の Password 値オブジェクトではありません');
  return hash;
}
