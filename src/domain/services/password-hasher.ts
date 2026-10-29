import type { NewPassword } from "../value-objects/new-password.js";
import type { PasswordCandidate } from "../value-objects/password-candidate.js";
import type { PasswordHash } from "../value-objects/password-hash.js";

// アルゴリズムの実装はインフラへ依存性逆転する。
export interface PasswordHasher {
  hash(password: NewPassword): Promise<PasswordHash>;
  verify(hash: PasswordHash, candidate: PasswordCandidate): Promise<boolean>;
}
